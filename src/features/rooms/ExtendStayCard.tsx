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

export type StepStatus = 'complete' | 'ready' | 'waiting';

/** One numbered step in a two-step workflow — numbered circle, connecting line, status highlight. */
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
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
            status === 'waiting'
              ? 'bg-black/[0.06] text-[var(--color-ink-muted)] dark:bg-white/10'
              : 'bg-[var(--color-accent)] text-white'
          }`}
        >
          {status === 'complete' ? '✓' : number}
        </span>
        {!isLast ? <span className="mt-0.5 w-px flex-1 bg-[var(--color-line)]" /> : null}
      </div>
      <div className={`min-w-0 flex-1 rounded-xl p-3 ${isLast ? '' : 'mb-3'} ${status === 'ready' ? 'border border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border border-[var(--color-line)]'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold">{title}</span>
          <span
            className={`text-[10.5px] font-medium ${status === 'waiting' ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-accent)]'}`}
          >
            {statusLabel}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Stay extension — proposes adding days to the planned discharge date, requiring sign-off from a
 * different person before the change takes effect. On approval, the DB immediately updates
 * `current_planned_discharge_date`; the board re-reads and the new date appears everywhere.
 *
 * Two visual modes: a compact row when nothing is pending (avoids hollow waiting steps filling
 * the panel), and a two-step workflow card once a request exists.
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
  const [additionalDays, setAdditionalDays] = useState('14');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!o.admissionId) return null;
  if (!o.extensionRequest && !canInitiate) return null;
  const admissionId = o.admissionId;

  const ext = o.extensionRequest as ExtensionRequestSummary | null;
  const isOwnRequest = ext?.requestedBy != null && ext.requestedBy === session?.user.id;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('idle');
      setReason('');
      setAdditionalDays('14');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const days = parseInt(additionalDays, 10);
  const previewDate = !isNaN(days) && days > 0 ? addDays(o.plannedDischargeDate, days) : null;

  /* ── No extension pending — compact single row ── */
  if (!ext) {
    return (
      <Panel title="Extend stay" subtitle="Request extra days — a second person must approve before the date changes.">
        {mode === 'idle' ? (
          <div className="flex items-center justify-between gap-3">
            <p className="nums text-[11.5px] text-[var(--color-ink-muted)]">
              Planned discharge: <span className="font-medium text-[var(--color-ink)]">{formatDate(new Date(o.plannedDischargeDate + 'T12:00:00Z'))}</span>
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
            <div>
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
                <p className="nums mt-1 text-[10.5px] text-[var(--color-ink-muted)]">
                  {formatDate(new Date(o.plannedDischargeDate + 'T12:00:00Z'))} &rarr; {formatDate(new Date(previewDate + 'T12:00:00Z'))}
                </p>
              ) : null}
            </div>
            <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
              Clinical reason
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-0.5 block w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <p className="text-[10px] text-[var(--color-ink-muted)]">
              A different person must approve this before the discharge date changes.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || !reason.trim() || isNaN(days) || days < 1}
                onClick={() => void run(async () => { await extensionService.request(admissionId, days, reason); })}
                className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Submit for approval'}
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
        )}
        {error ? (
          <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </Panel>
    );
  }

  /* ── Extension pending — two-step approval workflow ── */
  return (
    <Panel title="Extend stay" subtitle="Pending approval — a second person must sign off before the date changes.">
      <div className="flex flex-col">
        <DischargeStep number={1} isLast={false} title="Requested" status="complete">
          <div className="mt-1 space-y-0.5 text-[11px] text-[var(--color-ink-muted)]">
            <p>+{ext.additionalDays} days &mdash; {ext.reason}</p>
            <p className="nums">
              {formatDate(new Date(ext.originalDischargeDate + 'T12:00:00Z'))} &rarr; {formatDate(new Date(ext.newDischargeDate + 'T12:00:00Z'))}
            </p>
          </div>
        </DischargeStep>

        <DischargeStep number={2} isLast={true} title="Awaiting approval" status="ready">
          {canApprove && !isOwnRequest && mode === 'idle' ? (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => extensionService.decide(ext.id, true, null))}
                className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Approve'}
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
            <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">Waiting for sign-off.</p>
          )}

          {mode === 'reject' ? (
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
                  onClick={() => void run(() => extensionService.decide(ext.id, false, reason))}
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
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </Panel>
  );
}
