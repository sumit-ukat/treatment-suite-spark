import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Panel } from '../../components/ui.tsx';
import { extension as extensionService, roomsAndBeds } from '../../services/data-access.js';
import type { BedRow, RoomRow } from '../../services/data-access.js';
import type { Occupant } from './board-data.js';
import { formatDate } from '../../lib/format.js';
import { useAuth } from '../auth/AuthProvider.tsx';

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── DischargeStep — kept as a shared primitive ───────────────────────────────

export type StepStatus = 'complete' | 'ready' | 'waiting';

export function DischargeStep({
  number,
  isLast,
  title,
  status,
  children,
}: {
  number: number;
  isLast: boolean;
  title: string;
  status: StepStatus;
  children?: ReactNode;
}) {
  const statusLabel = status === 'complete' ? 'Complete' : status === 'ready' ? 'Ready to action' : 'Waiting';
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
          status === 'waiting'
            ? 'bg-black/[0.06] text-[var(--color-ink-muted)] dark:bg-white/10'
            : 'bg-[var(--color-accent)] text-white'
        }`}>
          {status === 'complete' ? '✓' : number}
        </span>
        {!isLast ? <span className="mt-0.5 w-px flex-1 bg-[var(--color-line)]" /> : null}
      </div>
      <div className={`min-w-0 flex-1 rounded-xl p-3 ${isLast ? '' : 'mb-3'} ${status === 'ready' ? 'border border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border border-[var(--color-line)]'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold">{title}</span>
          <span className={`text-[10.5px] font-medium ${status === 'waiting' ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-accent)]'}`}>
            {statusLabel}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Extension stepper pills ──────────────────────────────────────────────────

const EXT_STEP_LABELS = ['Request', 'Programme', 'Days'] as const;

function ExtStepPills({ active }: { active: 1 | 2 | 3 }) {
  return (
    <div className="mb-4 flex items-center">
      {EXT_STEP_LABELS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const done = step < active;
        const current = step === active;
        return (
          <div key={step} className="flex min-w-0 flex-1 items-center">
            <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              done    ? 'bg-[var(--color-accent)] text-white' :
              current ? 'border border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' :
                        'border border-[var(--color-line)] text-[var(--color-ink-muted)]'
            }`}>
              <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
                done    ? 'bg-white/20' :
                current ? 'bg-[var(--color-accent)] text-white' :
                          'bg-black/[0.06] dark:bg-white/10'
              }`}>
                {done ? '✓' : step}
              </span>
              {label}
            </div>
            {step < 3 ? (
              <div className={`mx-1.5 h-px flex-1 ${done ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]'}`} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─── ExtendStayCard ───────────────────────────────────────────────────────────

/**
 * Three-step stepper for stay extensions.
 *
 * Step 1 — Reason: why the extension is needed.
 * Step 2 — Programme: main programme (stay here, add days) or secondary (transfer to Providence).
 * Step 3 — Days: enter the number of additional days and confirm. The discharge date updates
 *           immediately — no second-person sign-off required (migration 0043).
 */
export function ExtendStayCard({
  occupant: o,
  centreId,
  onChanged,
}: {
  occupant: Occupant;
  centreId: string;
  onChanged?: (() => void) | undefined;
}) {
  const { can } = useAuth();
  const canInitiate = can('extension.initiate');

  const [mode, setMode] = useState<'idle' | 'form'>('idle');
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState('');
  const [programmeType, setProgrammeType] = useState<'main' | 'secondary'>('main');
  const [additionalDays, setAdditionalDays] = useState('14');
  const [changeBed, setChangeBed] = useState(false);
  const [newBedId, setNewBedId] = useState('');
  const [availableBeds, setAvailableBeds] = useState<Array<RoomRow & { bed: BedRow }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'form') {
      roomsAndBeds.availableBeds(centreId).then(setAvailableBeds).catch(() => {});
    }
  }, [mode, centreId]);

  if (!o.admissionId) return null;
  if (!canInitiate) return null;
  const admissionId = o.admissionId;

  const activeStep: 1 | 2 | 3 = mode === 'form' ? formStep : 1;

  async function applyExtension() {
    setBusy(true);
    setError(null);
    try {
      await extensionService.apply(
        admissionId,
        parseInt(additionalDays, 10),
        reason,
        changeBed && newBedId ? newBedId : null,
      );
      setMode('idle');
      setFormStep(1);
      setReason('');
      setProgrammeType('main');
      setAdditionalDays('14');
      setChangeBed(false);
      setNewBedId('');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  function cancelForm() {
    setMode('idle');
    setFormStep(1);
    setReason('');
    setProgrammeType('main');
    setAdditionalDays('14');
    setChangeBed(false);
    setNewBedId('');
    setError(null);
  }

  const days = parseInt(additionalDays, 10);
  const previewDate = !isNaN(days) && days > 0 ? addDays(o.plannedDischargeDate, days) : null;

  const subtitle = o.isExtendedStay
    ? `Already extended by ${o.extensionDays ?? '?'} day${o.extensionDays === 1 ? '' : 's'} — further extensions are allowed.`
    : 'Add days to the planned stay — the discharge date updates immediately.';

  return (
    <Panel title="Extend stay" subtitle={subtitle}>
      <ExtStepPills active={activeStep} />

      {/* ── Step 1: Reason ── */}
      {activeStep === 1 ? (
        mode === 'idle' ? (
          <div className="flex items-center justify-between gap-3">
            <p className="nums text-[11.5px] text-[var(--color-ink-muted)]">
              Planned discharge:{' '}
              <span className="font-medium text-[var(--color-ink)]">
                {formatDate(new Date(o.plannedDischargeDate + 'T12:00:00Z'))}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setMode('form')}
              className="shrink-0 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Extend stay&hellip;
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
              Clinical reason for extension
              <textarea
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why additional time is clinically indicated…"
                className="mt-0.5 block w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reason.trim()}
                onClick={() => setFormStep(2)}
                className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
              >
                Next
              </button>
              <button type="button" onClick={cancelForm}
                className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                Cancel
              </button>
            </div>
          </div>
        )
      ) : null}

      {/* ── Step 2: Programme type ── */}
      {activeStep === 2 ? (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-[var(--color-ink-muted)]">
            Which programme will {o.displayName} continue on?
          </p>

          <button
            type="button"
            onClick={() => { setProgrammeType('main'); setFormStep(3); }}
            className="flex items-start gap-3 rounded-xl border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-3 text-left transition hover:opacity-90"
          >
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[9px] font-bold text-white">✓</span>
            <div>
              <p className="text-[12px] font-semibold text-[var(--color-accent)]">Main programme</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
                Continues here — additional days added to the discharge date.
              </p>
            </div>
          </button>

          {/* Secondary programme — Providence only, locked for other centres */}
          <div className="flex cursor-not-allowed select-none items-start gap-3 rounded-xl border border-[var(--color-line)] p-3 opacity-50">
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-black/[0.06] text-[9px] font-bold text-[var(--color-ink-muted)] dark:bg-white/10">2</span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-semibold">Secondary programme</p>
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Providence only · coming soon
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
                Transfer to Providence for a secondary treatment programme.
              </p>
            </div>
          </div>

          <button type="button" onClick={() => setFormStep(1)}
            className="self-start rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
            ← Back
          </button>
        </div>
      ) : null}

      {/* ── Step 3a: Days (main programme) ── */}
      {activeStep === 3 && programmeType === 'main' ? (
        <div className="flex flex-col gap-3">
          {/* Bed / room selector */}
          <div className="rounded-xl border border-[var(--color-line)] p-3">
            <p className="mb-2 text-[10.5px] font-medium text-[var(--color-ink-muted)]">Bed / room</p>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={changeBed}
                onChange={(e) => {
                  setChangeBed(e.target.checked);
                  if (!e.target.checked) setNewBedId('');
                }}
                className="rounded accent-[var(--color-accent)]"
              />
              <span className="text-[12px]">Moving to a different bed or room</span>
            </label>
            {changeBed ? (
              availableBeds.length === 0 ? (
                <p className="mt-2 text-[11px] text-[var(--color-ink-muted)]">No available beds found.</p>
              ) : (
                <select
                  autoFocus
                  value={newBedId}
                  onChange={(e) => setNewBedId(e.target.value)}
                  className="mt-2 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                >
                  <option value="">Select a bed…</option>
                  {availableBeds.map((entry) => (
                    <option key={entry.bed.id} value={entry.bed.id}>
                      {entry.label} — {entry.bed.label}
                    </option>
                  ))}
                </select>
              )
            ) : null}
          </div>

          {/* Days input */}
          <div className="flex flex-col gap-1.5">
            <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
              Additional days
              <input
                type="number"
                min={1}
                max={365}
                value={additionalDays}
                onChange={(e) => setAdditionalDays(e.target.value)}
                className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            {previewDate ? (
              <p className="nums text-[10.5px] text-[var(--color-ink-muted)]">
                {formatDate(new Date(o.plannedDischargeDate + 'T12:00:00Z'))} &rarr;{' '}
                {formatDate(new Date(previewDate + 'T12:00:00Z'))}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || isNaN(days) || days < 1 || (changeBed && !newBedId)}
              onClick={() => void applyExtension()}
              className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Confirm extension'}
            </button>
            <button type="button" disabled={busy} onClick={() => setFormStep(2)}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
              ← Back
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Step 3b: Secondary programme placeholder ── */}
      {activeStep === 3 && programmeType === 'secondary' ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-[var(--color-ink-muted)]">
            Providence transfer coming soon.
          </p>
          <button type="button" onClick={() => setFormStep(2)}
            className="self-start rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
            ← Back
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </Panel>
  );
}
