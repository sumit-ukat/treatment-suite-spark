import { useEffect, useState } from 'react';
import type { BoardBed, BoardTask, DischargeRequestSummary, Occupant } from './board-data.js';
import { formatDate, formatDateWithDay } from '../../lib/format.js';
import { PhotoBadge } from './BedCard.tsx';
import { Chip } from '../../components/ui.tsx';
import { discharge as dischargeService, tasks as taskService } from '../../services/data-access.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { fromZonedDateString } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

// TODO: same scoped simplification as real-board-data.ts — every configured centre today is
// Europe/London.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

const DISCHARGE_TYPE_LABEL: Record<DischargeRequestSummary['dischargeType'], string> = {
  early: 'Early discharge',
  transfer: 'Transfer',
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

const CATEGORY_LABEL: Record<string, string> = {
  family_contact: 'Family contact',
  milestone: 'Treatment milestone',
  session: 'Session',
  medical: 'Medical',
  survey: 'Survey',
  discharge: 'Discharge',
  admin: 'Admin',
};

export function DetailPanel({
  bed,
  onClose,
  onChanged,
}: {
  bed: BoardBed;
  onClose: () => void;
  /**
   * Called after a task completion/reopen or a discharge action lands, so the board re-reads rather
   * than guessing the new state — a discharge in particular changes which bed this occupant is even
   * on (none, once discharged), which is not something to reconstruct locally.
   */
  onChanged?: (() => void) | undefined;
}) {
  const o = bed.occupant;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!o) return null;

  const sorted = [...o.tasks].sort((a, b) => {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  return (
    <>
      <div
        className="fixed inset-0 z-20 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Client file ${o.reference}`}
        className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[440px] flex-col border-l border-[var(--color-line)] bg-[var(--color-panel)] shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-line)] p-4">
          <PhotoBadge occupant={o} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{o.displayName}</div>
            <div className="nums mt-0.5 text-[11.5px] text-[var(--color-ink-muted)]">
              {o.reference} &middot; Bed {bed.label} &middot; Group {o.group}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {o.hasRestrictedAlert ? (
                <Chip icon="&#9873;" label="Restricted alert" tone="alert" />
              ) : null}
              {o.photoState === 'missing' ? (
                <Chip icon="!" label="No photograph" tone="warn" />
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[13px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close panel"
          >
            &#10005;
          </button>
        </header>

        <div className="nums grid grid-cols-2 gap-y-3 border-b border-[var(--color-line)] p-4 text-[12px]">
          <Fact label="Admitted" value={formatDateWithDay(o.admittedAt)} />
          <Fact label="Planned discharge" value={formatDateWithDay(o.plannedDischargeDate)} />
          <Fact label="Treatment day" value={`${o.treatmentDay} of ${o.durationDays}`} />
          <Fact
            label="Family meeting"
            value={
              o.familyMeetingEligibleNow
                ? 'Eligible now'
                : `From ${formatDate(o.familyMeetingEligibleFrom)}`
            }
          />
          <Fact label="Focal therapist" value={o.therapist ?? 'Not assigned'} />
          <Fact label="Buddy" value={o.buddy} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <DischargeSection occupant={o} onChanged={onChanged} />

          <div className="mb-2.5 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
              Required actions
            </h3>
            <span className="nums text-[11px] text-[var(--color-ink-muted)]">
              {o.completedCount} of {o.totalCount} complete
            </span>
          </div>

          <p className="mb-3 rounded-lg bg-[var(--color-accent-soft)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
            Each action carries a <strong className="font-semibold">due date</strong> separate from
            its completion. That is what makes lateness measurable &mdash; the whiteboard stores one
            value per action, so it cannot record &ldquo;due Monday, done Wednesday&rdquo;.
          </p>

          <ul className="flex flex-col gap-1">
            {sorted.map((t) => (
              <TaskRow key={t.id ?? t.code} task={t} onChanged={onChanged} />
            ))}
          </ul>
        </div>

        <footer className="border-t border-[var(--color-line)] px-4 py-3 text-[11px] text-[var(--color-ink-muted)]">
          Detox, medical, safeguarding and therapy notes are not shown in this preview &mdash; they
          sit behind sensitivity level 3 and need the access model first.
        </footer>
      </aside>
    </>
  );
}

/**
 * One action, with the controls to complete or reopen it.
 *
 * Three things decide whether a control appears, and all three are real constraints rather than
 * styling choices:
 *
 * 1. `task.id === null` — the fictional and frozen-snapshot boards have no database row behind them,
 *    so there is nothing to complete. They render exactly as before.
 * 2. `can('tasks.complete')` / `can('tasks.reopen')` — hiding a button the server would refuse is
 *    honest UI, not security. The database enforces both regardless of what is rendered here.
 * 3. `requiresCompletionNote` — asked for up front instead of letting the user submit and bounce off
 *    a server error. The server still enforces it; this only saves a round trip.
 */
function TaskRow({ task: t, onChanged }: { task: BoardTask; onChanged?: (() => void) | undefined }) {
  const { can } = useAuth();
  const [mode, setMode] = useState<'idle' | 'note' | 'reopen'>('idle');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReal = t.id !== null;
  const canComplete = isReal && !t.isComplete && !t.isNotApplicable && can('tasks.complete');
  const canReopen = isReal && t.isComplete && can('tasks.reopen');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('idle');
      setText('');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const complete = () => {
    if (!t.id) return;
    // Guard the note requirement here too, so the button cannot fire an empty note.
    if (t.requiresCompletionNote && !text.trim()) {
      setMode('note');
      return;
    }
    void run(() => taskService.complete(t.id!, text));
  };

  return (
    <li className="rounded-lg border border-[var(--color-line)] px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`grid size-[17px] shrink-0 place-items-center rounded-full text-[9.5px] font-bold ${
            t.isComplete
              ? 'bg-emerald-600 text-white'
              : t.isOverdue
                ? 'bg-red-600 text-white'
                : t.isDueToday
                  ? 'bg-amber-500 text-white'
                  : 'border border-[var(--color-line)]'
          }`}
        >
          {t.isComplete ? '✓' : t.isOverdue ? '!' : t.isDueToday ? '●' : ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] leading-tight">{t.title}</span>
          <span className="text-[10px] text-[var(--color-ink-muted)]">
            {CATEGORY_LABEL[t.category] ?? t.category}
          </span>
        </span>
        <span className="nums shrink-0 text-right text-[11px] text-[var(--color-ink-muted)]">
          {t.dueAt ? formatDate(t.dueAt) : '—'}
        </span>
        {t.isComplete ? (
          <Chip icon="&#10003;" label="Done" tone="good" />
        ) : t.isOverdue ? (
          <Chip icon="&#9650;" label="Overdue" tone="alert" />
        ) : t.isDueToday ? (
          <Chip icon="&#9679;" label="Today" tone="warn" />
        ) : (
          <Chip icon="&#9719;" label="Open" />
        )}

        {canComplete && mode === 'idle' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => (t.requiresCompletionNote ? setMode('note') : complete())}
            className="shrink-0 rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            {busy ? '…' : 'Mark done'}
          </button>
        ) : null}

        {canReopen && mode === 'idle' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('reopen')}
            className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            Reopen
          </button>
        ) : null}
      </div>

      {mode !== 'idle' ? (
        <div className="mt-2 border-t border-[var(--color-line)] pt-2">
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            {mode === 'note' ? 'Completion note (required for this action)' : 'Why is this being reopened?'}
          </label>
          <textarea
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
          {mode === 'reopen' ? (
            <p className="mt-1 text-[10px] text-[var(--color-ink-muted)]">
              This removes the completion record. The reason is kept in the audit trail.
            </p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() =>
                mode === 'note'
                  ? complete()
                  : void run(() => taskService.reopen(t.id!, text))
              }
              className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
            >
              {busy ? 'Saving…' : mode === 'note' ? 'Mark done' : 'Reopen'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode('idle');
                setText('');
                setError(null);
              }}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The discharge workflow — see migration 0027 for the reasoning behind the two paths this mirrors:
 *
 * - `discharge_type: 'planned'` is routine and needs only `discharge.finalise`, so the form submits
 *   straight to `finalise`.
 * - Anything else needs a different person to approve it first, so the same form instead calls
 *   `request`, and the resulting pending/approved state renders here until someone with
 *   `discharge.approve` — never the requester themselves, enforced server-side — decides it, and then
 *   someone with `discharge.finalise` closes it out.
 *
 * `occupant.admissionId === null` (the fictional and frozen boards) renders nothing: there is no real
 * admission to discharge.
 */
function DischargeSection({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No database row behind this occupant — see the doc comment on Occupant.admissionId.
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
    } else {
      // request() returns the new request's id, which nothing here needs — run() only wants void.
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

  return (
    <div className="mb-4 rounded-lg border border-[var(--color-line)] p-3">
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
        Discharge
      </h3>

      {!req && mode === 'idle' ? (
        canInitiate || canFinalise ? (
          <button
            type="button"
            onClick={() => setMode('form')}
            className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            Discharge&hellip;
          </button>
        ) : (
          <p className="text-[11.5px] text-[var(--color-ink-muted)]">No discharge in progress.</p>
        )
      ) : null}

      {!req && mode === 'form' ? (
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
              onClick={() => {
                setMode('idle');
                setReason('');
                setError(null);
              }}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {req && req.status === 'pending' ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11.5px]">
            <span className="font-medium">{DISCHARGE_TYPE_LABEL[req.dischargeType]}</span> requested
            &mdash; awaiting approval.
          </p>
          <p className="text-[11px] text-[var(--color-ink-muted)]">{req.reason}</p>

          {canApprove && !isOwnRequest && mode === 'idle' ? (
            <div className="mt-1 flex items-center gap-2">
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
            <p className="text-[10px] text-[var(--color-ink-muted)]">
              You requested this &mdash; a different person must approve it.
            </p>
          ) : null}

          {mode === 'reject' ? (
            <div className="mt-1">
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
                  onClick={() => {
                    setMode('idle');
                    setReason('');
                  }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {req && req.status === 'approved' ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11.5px]">
            <span className="font-medium">{DISCHARGE_TYPE_LABEL[req.dischargeType]}</span> approved
            &mdash; ready to finalise.
          </p>
          {req.approvalNotes ? (
            <p className="text-[11px] text-[var(--color-ink-muted)]">{req.approvalNotes}</p>
          ) : null}

          {canFinalise && mode === 'idle' ? (
            <button
              type="button"
              onClick={() => setMode('form')}
              className="mt-1 self-start rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Finalise discharge&hellip;
            </button>
          ) : null}

          {mode === 'form' ? (
            <div className="mt-1 flex flex-col gap-2">
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
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 pr-3">
      <div className="text-[10.5px] text-[var(--color-ink-muted)]">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
