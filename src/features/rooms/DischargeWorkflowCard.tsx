import { useState } from 'react';
import { Panel } from '../../components/ui.tsx';
import { discharge as dischargeService } from '../../services/data-access.js';
import type { DischargeRequestSummary, Occupant } from './board-data.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { fromZonedDateString } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

const DISCHARGE_TYPE_LABEL: Record<DischargeRequestSummary['dischargeType'], string> = {
  early: 'Early discharge',
  transfer: 'Transfer out',
  other: 'Other',
};

function dischargeTimestamp(dateStr: string): Date {
  const noon = fromZonedDateString(dateStr, TZ, { hour: 12, minute: 0 });
  const now = new Date();
  return noon.getTime() > now.getTime() ? now : noon;
}

const STEP_LABELS = ['Requested', 'Approved', 'Finalised'] as const;

function StepPills({ active }: { active: 1 | 2 | 3 }) {
  return (
    <div className="mb-4 flex items-center">
      {STEP_LABELS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const done = step < active;
        const current = step === active;
        return (
          <div key={step} className="flex min-w-0 flex-1 items-center">
            <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              done
                ? 'bg-[var(--color-accent)] text-white'
                : current
                ? 'border border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'border border-[var(--color-line)] text-[var(--color-ink-muted)]'
            }`}>
              <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
                done
                  ? 'bg-white/20'
                  : current
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-black/[0.06] dark:bg-white/10'
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

export function DischargeWorkflowCard({
  occupant: o,
  onChanged,
}: {
  occupant: Occupant;
  onChanged?: (() => void) | undefined;
}) {
  const { can, session } = useAuth();
  const canInitiate = can('discharge.initiate');
  const canApprove = can('discharge.approve');
  const canFinalise = can('discharge.finalise');

  const [mode, setMode] = useState<'idle' | 'form' | 'reject'>('idle');
  const [dischargeType, setDischargeType] = useState<DischargeRequestSummary['dischargeType'] | 'planned'>(
    () => (canFinalise ? 'planned' : 'early'),
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [transferDestination, setTransferDestination] = useState('');
  const [transferTreatmentType, setTransferTreatmentType] = useState('');
  const [transferDurationDays, setTransferDurationDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!o.admissionId) return null;
  const admissionId = o.admissionId;

  const req = o.dischargeRequest;
  const isOwnRequest = req?.requestedBy != null && req.requestedBy === session?.user.id;

  // Which step is currently active.
  const activeStep: 1 | 2 | 3 = !req ? 1 : req.status === 'pending' ? 2 : 3;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('idle');
      setReason('');
      setTransferDestination('');
      setTransferTreatmentType('');
      setTransferDurationDays('');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const submitNewDischarge = () => {
    if (!reason.trim()) return;
    const at = dischargeTimestamp(date).toISOString();
    if (dischargeType === 'planned') {
      void run(() => dischargeService.finalise(admissionId, 'planned', at, reason));
    } else if (dischargeType === 'transfer') {
      void run(async () => {
        await dischargeService.requestTransfer(
          admissionId, reason, transferDestination, transferTreatmentType,
          transferDurationDays ? parseInt(transferDurationDays, 10) : null,
        );
      });
    } else {
      void run(async () => { await dischargeService.request(admissionId, dischargeType, reason); });
    }
  };

  const finaliseApprovedRequest = () => {
    if (!req) return;
    const at = dischargeTimestamp(date).toISOString();
    void run(() => dischargeService.finalise(admissionId, req.dischargeType, at, reason || null));
  };

  const dateField = (
    <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
      Date
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
      />
    </label>
  );

  return (
    <Panel title="Discharge workflow" subtitle="Three sign-off steps. Each one is written to the audit trail.">
      <StepPills active={activeStep} />

      {/* ── Step 1: Initiate ── */}
      {activeStep === 1 ? (
        <div>
          {mode === 'idle' ? (
            canInitiate || canFinalise ? (
              <button
                type="button"
                onClick={() => setMode('form')}
                className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                Discharge&hellip;
              </button>
            ) : (
              <p className="text-[11px] text-[var(--color-ink-muted)]">No discharge in progress.</p>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                Type
                <select
                  value={dischargeType}
                  onChange={(e) => setDischargeType(e.target.value as typeof dischargeType)}
                  className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                >
                  {canFinalise ? <option value="planned">Planned (on schedule)</option> : null}
                  {canInitiate ? <option value="early">Early discharge</option> : null}
                  {canInitiate ? <option value="transfer">Transfer</option> : null}
                  {canInitiate ? <option value="other">Other</option> : null}
                </select>
              </label>
              {dateField}
              <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                Reason
                <textarea
                  autoFocus
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-0.5 block w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                />
              </label>
              {dischargeType === 'transfer' ? (
                <>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Destination facility
                    <input type="text" value={transferDestination} onChange={(e) => setTransferDestination(e.target.value)}
                      placeholder="e.g. Castle Craig, another UKAT centre…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Treatment type at destination
                    <input type="text" value={transferTreatmentType} onChange={(e) => setTransferTreatmentType(e.target.value)}
                      placeholder="e.g. Day programme, outpatient…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Duration at destination (days, optional)
                    <input type="number" min={1} value={transferDurationDays} onChange={(e) => setTransferDurationDays(e.target.value)}
                      placeholder="Leave blank if unknown"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                  </label>
                </>
              ) : null}
              {dischargeType !== 'planned' ? (
                <p className="text-[10px] text-[var(--color-ink-muted)]">
                  This needs sign-off from a different person before it can be finalised.
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy || !reason.trim()} onClick={submitNewDischarge}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : dischargeType === 'planned' ? 'Discharge' : 'Submit for approval'}
                </button>
                <button type="button" disabled={busy} onClick={() => { setMode('idle'); setReason(''); setError(null); }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Step 2: Approve ── */}
      {activeStep === 2 && req ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-ink-muted)]">
            <p className="font-medium text-[var(--color-ink)]">{DISCHARGE_TYPE_LABEL[req.dischargeType]}</p>
            <p className="mt-0.5">{req.reason}</p>
            {req.dischargeType === 'transfer' && req.transferDestination ? (
              <p className="mt-0.5">To: {req.transferDestination}{req.transferTreatmentType ? ` · ${req.transferTreatmentType}` : ''}{req.transferDurationDays ? ` · ${req.transferDurationDays}d` : ''}</p>
            ) : null}
          </div>

          {mode === 'idle' ? (
            canApprove && !isOwnRequest ? (
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy}
                  onClick={() => void run(() => dischargeService.decide(req.id, true, null))}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : 'Approve'}
                </button>
                <button type="button" disabled={busy} onClick={() => setMode('reject')}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Reject
                </button>
              </div>
            ) : canApprove && isOwnRequest ? (
              <p className="text-[10px] text-[var(--color-ink-muted)]">You requested this — a different person must approve it.</p>
            ) : (
              <p className="text-[11px] text-[var(--color-ink-muted)]">Centre manager signs it off.</p>
            )
          ) : null}

          {mode === 'reject' ? (
            <div className="flex flex-col gap-1.5">
              <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                Why is this being rejected?
                <textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                  className="mt-0.5 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
              </label>
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy || !reason.trim()}
                  onClick={() => void run(() => dischargeService.decide(req.id, false, reason))}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : 'Reject'}
                </button>
                <button type="button" disabled={busy} onClick={() => { setMode('idle'); setReason(''); }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Step 3: Finalise ── */}
      {activeStep === 3 && req ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-ink-muted)]">
            <p className="font-medium text-[var(--color-ink)]">{DISCHARGE_TYPE_LABEL[req.dischargeType]} — approved</p>
            <p className="mt-0.5">{req.approvalNotes || req.reason}</p>
          </div>

          {canFinalise && mode === 'idle' ? (
            <button type="button" onClick={() => setMode('form')}
              className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10">
              Finalise discharge&hellip;
            </button>
          ) : mode === 'form' ? (
            <div className="flex flex-col gap-2">
              {dateField}
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy} onClick={finaliseApprovedRequest}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : 'Finalise discharge'}
                </button>
                <button type="button" disabled={busy} onClick={() => setMode('idle')}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          ) : !canFinalise ? (
            <p className="text-[11px] text-[var(--color-ink-muted)]">Waiting for someone with finalise permission.</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </Panel>
  );
}
