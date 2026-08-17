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

// ─── ExtendStayCard ───────────────────────────────────────────────────────────

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

  const canSubmit = reason.trim().length > 0 && programmeType === 'main' && !isNaN(days) && days >= 1 && !(changeBed && !newBedId);

  return (
    <Panel title="Extend stay" subtitle={subtitle}>
      {mode === 'idle' ? (
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
        <div className="flex flex-col gap-4">

          {/* Clinical reason */}
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

          {/* Programme */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10.5px] text-[var(--color-ink-muted)]">
              Which programme will {o.displayName} continue on?
            </p>
            <button
              type="button"
              onClick={() => setProgrammeType('main')}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition hover:opacity-90 ${
                programmeType === 'main'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                  : 'border-[var(--color-line)]'
              }`}
            >
              <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
                programmeType === 'main'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-black/[0.06] dark:bg-white/10'
              }`}>
                {programmeType === 'main' ? '✓' : '1'}
              </span>
              <div>
                <p className={`text-[12px] font-semibold ${programmeType === 'main' ? 'text-[var(--color-accent)]' : ''}`}>
                  Main programme
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
                  Continues here — additional days added to the discharge date.
                </p>
              </div>
            </button>

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
          </div>

          {/* Bed / room (main programme only) */}
          {programmeType === 'main' ? (
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
          ) : null}

          {/* Additional days (main programme only) */}
          {programmeType === 'main' ? (
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
          ) : null}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() => void applyExtension()}
              className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Confirm extension'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancelForm}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </Panel>
  );
}
