import { useState } from 'react';
import type { ReactNode } from 'react';
import { Panel } from '../../components/ui.tsx';
import { extension as extensionService } from '../../services/data-access.js';
import type { ExtensionRequestSummary, Occupant } from './board-data.js';
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
 * Step 2 — Programme: main programme (stay here, add days) or secondary programme
 *           (transfer to Providence). Secondary is reserved for the Providence centre;
 *           other centres will see it locked with a "coming soon" label until that
 *           routing is built.
 * Step 3 — Days (main) / Transfer (secondary): enter the additional days or the
 *           Providence transfer details, then submit for approval. Once submitted the
 *           same step 3 slot shows the approve / reject interface for the second person.
 */
export function ExtendStayCard({
  occupant: o,
  onChanged,
}: {
  occupant: Occupant;
  onChanged?: (() => void) | undefined;
}) {
  const { can, session } = useAuth();
  const canInitiate = can('extension.initiate');
  const canApprove = can('extension.approve');

  const [mode, setMode] = useState<'idle' | 'form' | 'reject'>('idle');
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState('');
  const [programmeType, setProgrammeType] = useState<'main' | 'secondary'>('main');
  const [additionalDays, setAdditionalDays] = useState('14');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!o.admissionId) return null;
  if (!o.extensionRequest && !canInitiate) return null;
  const admissionId = o.admissionId;

  const ext = o.extensionRequest as ExtensionRequestSummary | null;
  const isOwnRequest = ext?.requestedBy != null && ext.requestedBy === session?.user.id;

  // Active pill step: pending approval locks to 3; form tracks formStep; idle = 1.
  const activeStep: 1 | 2 | 3 = ext ? 3 : mode === 'form' ? formStep : 1;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('idle');
      setFormStep(1);
      setReason('');
      setProgrammeType('main');
      setAdditionalDays('14');
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
    setError(null);
  }

  const days = parseInt(additionalDays, 10);
  const previewDate = !isNaN(days) && days > 0 ? addDays(o.plannedDischargeDate, days) : null;

  const subtitle = ext
    ? 'Pending approval — the discharge date changes on sign-off.'
    : 'Request extra days — a second person must approve before the date changes.';

  return (
    <Panel title="Extend stay" subtitle={subtitle}>
      <ExtStepPills active={activeStep} />

      {/* ── Step 1: Reason ── */}
      {!ext && activeStep === 1 ? (
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
              Request extension&hellip;
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
      {!ext && activeStep === 2 ? (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-[var(--color-ink-muted)]">
            Which programme will {o.displayName} continue on?
          </p>

          {/* Main programme */}
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
          <div className="flex items-start gap-3 rounded-xl border border-[var(--color-line)] p-3 opacity-50 cursor-not-allowed select-none">
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
      {!ext && activeStep === 3 && programmeType === 'main' ? (
        <div className="flex flex-col gap-2">
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Additional days
            <input
              type="number"
              min={1}
              max={365}
              autoFocus
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
          <p className="text-[10px] text-[var(--color-ink-muted)]">
            A different person must approve this before the date changes.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || isNaN(days) || days < 1}
              onClick={() => void run(async () => { await extensionService.request(admissionId, days, reason); })}
              className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Submit for approval'}
            </button>
            <button type="button" disabled={busy} onClick={() => setFormStep(2)}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
              ← Back
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Step 3b: Secondary programme placeholder ── */}
      {!ext && activeStep === 3 && programmeType === 'secondary' ? (
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

      {/* ── Step 3 — Pending approval (ext exists) ── */}
      {ext ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-ink-muted)]">
            <p className="font-medium text-[var(--color-ink)]">Main programme &mdash; +{ext.additionalDays} days</p>
            <p className="nums mt-0.5">
              {formatDate(new Date(ext.originalDischargeDate + 'T12:00:00Z'))} &rarr;{' '}
              {formatDate(new Date(ext.newDischargeDate + 'T12:00:00Z'))}
            </p>
            <p className="mt-0.5 italic">{ext.reason}</p>
          </div>

          {mode !== 'reject' ? (
            canApprove && !isOwnRequest ? (
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy}
                  onClick={() => void run(() => extensionService.decide(ext.id, true, null))}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : 'Approve'}
                </button>
                <button type="button" disabled={busy} onClick={() => setMode('reject')}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Reject
                </button>
              </div>
            ) : canApprove && isOwnRequest ? (
              <p className="text-[10px] text-[var(--color-ink-muted)]">
                You requested this — a different person must approve it.
              </p>
            ) : (
              <p className="text-[11px] text-[var(--color-ink-muted)]">Waiting for sign-off.</p>
            )
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                Why is this being rejected?
                <textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                  className="mt-0.5 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
              </label>
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy || !reason.trim()}
                  onClick={() => void run(() => extensionService.decide(ext.id, false, reason))}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : 'Reject'}
                </button>
                <button type="button" disabled={busy} onClick={() => { setMode('idle'); setReason(''); }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </Panel>
  );
}
