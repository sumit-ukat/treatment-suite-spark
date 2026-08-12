import { useState } from 'react';
import { Panel } from '../../components/ui.tsx';
import { discharge as dischargeService } from '../../services/data-access.js';
import type { DischargeRequestSummary, Occupant } from './board-data.js';
import { DischargeStep } from './ExtendStayCard.tsx';
import type { StepStatus } from './ExtendStayCard.tsx';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { fromZonedDateString } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

const DISCHARGE_TYPE_LABEL: Record<DischargeRequestSummary['dischargeType'], string> = {
  early: 'Early discharge',
  transfer: 'Transfer out',
  other: 'Other',
};

/**
 * The date field has no time component, so a time of day has to be invented for a date-only pick.
 * Noon is the convention used everywhere else in this codebase for a past or future calendar date —
 * but `app.finalise_discharge` refuses anything after "now" (with a small tolerance), and noon on
 * *today* is in the future for every user signing in before midday. Using the real current instant
 * whenever the naive noon value would be later than it keeps "today" always valid, and still gives a
 * stable noon timestamp for a genuinely backdated entry, where the exact time is not known anyway.
 */
function dischargeTimestamp(dateStr: string): Date {
  const noon = fromZonedDateString(dateStr, TZ, { hour: 12, minute: 0 });
  const now = new Date();
  return noon.getTime() > now.getTime() ? now : noon;
}

/**
 * The discharge workflow — see migration 0027 for the reasoning behind the two paths this mirrors.
 *
 * `occupant.admissionId === null` (the fictional and frozen boards) renders nothing: there is no real
 * admission to discharge.
 */
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
          admissionId,
          reason,
          transferDestination,
          transferTreatmentType,
          transferDurationDays ? parseInt(transferDurationDays, 10) : null,
        );
      });
    } else {
      void run(async () => {
        await dischargeService.request(admissionId, dischargeType, reason);
      });
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

  const step1Status: StepStatus = req ? 'complete' : mode === 'form' ? 'ready' : 'waiting';
  const step2Status: StepStatus = !req ? 'waiting' : req.status === 'approved' ? 'complete' : 'ready';
  const step3Status: StepStatus = req?.status === 'approved' ? 'ready' : 'waiting';

  return (
    <Panel title="Discharge workflow" subtitle="Three sign-off steps. Each one is written to the audit trail.">
      <div className="flex flex-col">
        <DischargeStep number={1} isLast={false} title="Requested" status={step1Status}>
          {!req && mode === 'idle' ? (
            canInitiate || canFinalise ? (
              <button
                type="button"
                onClick={() => setMode('form')}
                className="mt-1.5 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                Discharge&hellip;
              </button>
            ) : (
              <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">No discharge in progress.</p>
            )
          ) : null}

          {!req && mode === 'form' ? (
            <div className="mt-2 flex flex-col gap-2">
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
                    <input
                      type="text"
                      value={transferDestination}
                      onChange={(e) => setTransferDestination(e.target.value)}
                      placeholder="e.g. Castle Craig, another UKAT centre…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Treatment type at destination
                    <input
                      type="text"
                      value={transferTreatmentType}
                      onChange={(e) => setTransferTreatmentType(e.target.value)}
                      placeholder="e.g. Day programme, outpatient…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Duration at destination (days, optional)
                    <input
                      type="number"
                      min={1}
                      value={transferDurationDays}
                      onChange={(e) => setTransferDurationDays(e.target.value)}
                      placeholder="Leave blank if unknown"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                </>
              ) : null}
              {dischargeType !== 'planned' ? (
                <p className="text-[10px] text-[var(--color-ink-muted)]">
                  This needs sign-off from a different person before it can be finalised.
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={submitNewDischarge}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
                >
                  {busy ? 'Saving…' : dischargeType === 'planned' ? 'Discharge' : 'Submit for approval'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setMode('idle'); setReason(''); setError(null); }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {req ? (
            <div className="mt-1 space-y-0.5 text-[11px] text-[var(--color-ink-muted)]">
              <p>{DISCHARGE_TYPE_LABEL[req.dischargeType]} &mdash; {req.reason}</p>
              {req.dischargeType === 'transfer' && req.transferDestination ? (
                <p>To: {req.transferDestination}{req.transferTreatmentType ? ` · ${req.transferTreatmentType}` : ''}{req.transferDurationDays ? ` · ${req.transferDurationDays}d` : ''}</p>
              ) : null}
            </div>
          ) : null}
        </DischargeStep>

        <DischargeStep number={2} isLast={false} title="Approved" status={step2Status}>
          {req && req.status === 'pending' ? (
            canApprove && !isOwnRequest && mode === 'idle' ? (
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => dischargeService.decide(req.id, true, null))}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setMode('reject')}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Reject
                </button>
              </div>
            ) : canApprove && isOwnRequest ? (
              <p className="mt-1 text-[10px] text-[var(--color-ink-muted)]">
                You requested this &mdash; a different person must approve it.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">Centre manager signs it off.</p>
            )
          ) : !req ? (
            <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">Centre manager signs it off.</p>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
              {req.approvalNotes || 'Approved — ready to finalise.'}
            </p>
          )}

          {mode === 'reject' && req ? (
            <div className="mt-2">
              <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                Why is this being rejected?
              </label>
              <textarea
                autoFocus
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-0.5 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() => void run(() => dischargeService.decide(req.id, false, reason))}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
                >
                  {busy ? 'Saving…' : 'Reject'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setMode('idle'); setReason(''); }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </DischargeStep>

        <DischargeStep number={3} isLast={true} title="Finalised" status={step3Status}>
          {req && req.status === 'approved' ? (
            canFinalise && mode === 'idle' ? (
              <button
                type="button"
                onClick={() => setMode('form')}
                className="mt-1.5 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                Finalise discharge&hellip;
              </button>
            ) : mode === 'form' ? (
              <div className="mt-2 flex flex-col gap-2">
                {dateField}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={finaliseApprovedRequest}
                    className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
                  >
                    {busy ? 'Saving…' : 'Finalise discharge'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMode('idle')}
                    className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null
          ) : (
            <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">Bed released and record closed.</p>
          )}
        </DischargeStep>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </Panel>
  );
}
