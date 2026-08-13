import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRightFromLine, Calendar, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Info, Pencil, X } from 'lucide-react';
import type { BoardBed, BoardTask } from './board-data.js';
import { formatDate } from '../../lib/format.js';
import { StatusBadge, type StatusKey } from '../../components/status-badge.tsx';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { admissions, concerns, tasks as taskService, type ConcernRow, type TaskDateChangeRow } from '../../services/data-access.js';
import { ExtendStayCard } from './ExtendStayCard.tsx';
import { DischargeWorkflowCard } from './DischargeWorkflowCard.tsx';
import { PhotoBadge } from './BedCard.tsx';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { calendarDaysBetween } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

const CONCERN_LABEL: Record<string, string> = {
  behaviour: 'Behaviour',
  risk: 'Risk',
  medical: 'Medical',
  welfare: 'Welfare',
  general: 'General',
};

type CategoryFilter = 'all' | 'family_contact' | 'milestone' | 'session' | 'survey' | 'medical';

// ─── Timeline stat chip ───────────────────────────────────────────────────────

function StatPill({ color, count, label }: { color: string; count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[10.5px]">
      <span className="block size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <strong className="font-bold">{count}</strong>
      <span className="text-[var(--color-ink-muted)]">{label}</span>
    </span>
  );
}

const CAT_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  family_contact: 'Family contact',
  milestone: 'Milestones',
  session: 'Sessions',
  survey: 'Survey',
  medical: 'Medical',
};

const CAT_KEYS: readonly CategoryFilter[] = [
  'all', 'family_contact', 'milestone', 'session', 'survey', 'medical',
];

function dotColor(t: BoardTask): string {
  if (t.isNotApplicable) return 'transparent';
  if (t.isComplete) {
    if (t.completedAt && t.dueAt && t.completedAt > t.dueAt) return '#EF9F27';
    return '#1D9E75';
  }
  if (t.isOverdue) return '#E24B4A';
  if (t.isDueToday) return '#EF9F27';
  if (t.recorded.kind === 'scheduled') return '#85B7EB';
  return '#B4B2A9';
}

/** Whole calendar days between due date and completion. Positive = late, negative = early. */
function variance(t: BoardTask): { days: number; text: string; cls: string } | null {
  if (!t.isComplete || !t.completedAt || !t.dueAt) return null;
  const days = calendarDaysBetween(t.dueAt, t.completedAt, TZ);
  if (days === 0) return { days, text: 'on time', cls: 'text-emerald-600 dark:text-emerald-400' };
  if (days > 0) return {
    days,
    text: days === 1 ? '1 day late' : `${days} days late`,
    cls: 'text-amber-600 dark:text-amber-400',
  };
  const abs = Math.abs(days);
  return {
    days,
    text: abs === 1 ? '1 day early' : `${abs} days early`,
    cls: 'text-emerald-600 dark:text-emerald-400',
  };
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateStr(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task: t,
  onChanged,
}: {
  task: BoardTask;
  onChanged?: (() => void) | undefined;
}) {
  const { can } = useAuth();
  const [mode, setMode] = useState<'idle' | 'note' | 'reopen'>('idle');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllReopens, setShowAllReopens] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleHistory, setRescheduleHistory] = useState<TaskDateChangeRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<TaskDateChangeRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // After the green flash, trigger the refresh so the card moves to Done.
  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => { onChanged?.(); }, 1500);
    return () => clearTimeout(timer);
  }, [justCompleted, onChanged]);

  const isReal = t.id !== null;
  const canComplete = isReal && !t.isComplete && !t.isNotApplicable && can('tasks.complete');
  const canReopen = isReal && t.isComplete && can('tasks.reopen');
  const canReschedule = isReal && !t.isComplete && !t.isNotApplicable && can('tasks.complete');
  const v = variance(t);

  function openReschedule() {
    setRescheduleDate(t.dueAt ? t.dueAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setRescheduleReason('');
    setRescheduleError(null);
    setRescheduleHistory([]);
    setRescheduleOpen(true);
    if (t.id) taskService.dateHistory(t.id).then(setRescheduleHistory).catch(() => {});
  }

  async function doReschedule() {
    if (!t.id || !rescheduleDate || !rescheduleReason.trim()) return;
    setRescheduleBusy(true);
    setRescheduleError(null);
    try {
      await taskService.reschedule(t.id, new Date(rescheduleDate + 'T12:00:00'), rescheduleReason);
      setRescheduleOpen(false);
      setRescheduleDate('');
      setRescheduleReason('');
      onChanged?.();
    } catch (err) {
      setRescheduleError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setRescheduleBusy(false);
    }
  }

  function openHistory() {
    if (!t.id) return;
    setHistoryRows([]);
    setHistoryLoading(true);
    setHistoryOpen(true);
    taskService.dateHistory(t.id)
      .then(setHistoryRows)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('idle');
      setText('');
      setJustCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const complete = () => {
    if (!t.id) return;
    if (t.requiresCompletionNote && !text.trim()) { setMode('note'); return; }
    void run(() => taskService.complete(t.id!, text));
  };

  // Days overdue relative to today's real date (consistent with DetailPanel).
  const daysOverdue = t.isOverdue && t.dueAt
    ? calendarDaysBetween(t.dueAt, new Date(), TZ)
    : 0;

  // Days until due for upcoming tasks — only show when genuinely in the future.
  const daysUntilDue = !t.isComplete && !t.isOverdue && !t.isDueToday && t.dueAt
    ? calendarDaysBetween(new Date(), t.dueAt, TZ)
    : null;

  const borderCls = t.isOverdue
    ? 'border-l-[3px] border-l-red-500 border-red-200/60 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
    : t.isDueToday && !t.isComplete
    ? 'border-l-[3px] border-l-amber-400 border-amber-200/50 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/20'
    : t.isComplete
    ? 'border-[var(--color-line)] bg-[var(--color-surface)]'
    : 'border-[var(--color-line)]';

  const mostRecentReopen = t.reopens[0] ?? null;

  if (justCompleted) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex items-center gap-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px] font-bold">✓</span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-emerald-800 dark:text-emerald-200">{t.title}</p>
          <span className="shrink-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Marked done</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${borderCls}`}>

      {/* ── Top row: title + badge + action ── */}
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] leading-snug ${t.isComplete ? 'line-through text-[var(--color-ink-muted)]' : 'font-medium'}`}>
            {t.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {t.isOverdue ? (
            <StatusBadge status="overdue" label="Overdue" size="sm" />
          ) : t.isDueToday && !t.isComplete ? (
            <StatusBadge status="attention" label="Due today" size="sm" />
          ) : t.isComplete ? (
            <StatusBadge status="complete" label="Done" size="sm" />
          ) : t.isNotApplicable ? (
            <StatusBadge status="neutral" label="N/A" size="sm" />
          ) : null}

          {canComplete && mode === 'idle' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => (t.requiresCompletionNote ? setMode('note') : complete())}
              className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? '…' : 'Mark done'}
            </button>
          ) : null}

          {canReopen && mode === 'idle' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode('reopen')}
              className="rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Reopen
            </button>
          ) : null}

          {canReschedule && mode === 'idle' ? (
            <button
              type="button"
              title="Change due date"
              onClick={openReschedule}
              className="rounded-md border border-[var(--color-line)] p-1 text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              <Calendar className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Timing metadata — every permutation ── */}
      <div className="nums mt-1.5 space-y-1 text-[10.5px]">

        {/* Due date row */}
        {t.dueAt ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[var(--color-ink-muted)]">Due {formatDate(t.dueAt)}</span>

            {/* OVERDUE — how many days */}
            {t.isOverdue ? (
              <span className="font-bold text-red-600 dark:text-red-400">
                {daysOverdue === 0
                  ? '— overdue today'
                  : daysOverdue === 1
                  ? '— 1 day overdue'
                  : `— ${daysOverdue} days overdue`}
              </span>
            ) : null}

            {/* DUE TODAY — urgency */}
            {t.isDueToday && !t.isComplete ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                — must be completed today
              </span>
            ) : null}

            {/* COMING UP — days away */}
            {daysUntilDue !== null && daysUntilDue > 0 ? (
              <span className="text-[var(--color-ink-muted)]">
                — {daysUntilDue === 1 ? 'due tomorrow' : `in ${daysUntilDue} days`}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-[var(--color-ink-muted)]">No due date recorded</p>
        )}

        {/* RESCHEDULED indicator — clickable badge */}
        {t.hasDateChanges ? (
          <button
            type="button"
            onClick={openHistory}
            className="flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9.5px] font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400 dark:hover:bg-sky-950/60"
          >
            <Calendar className="size-2.5 shrink-0" />
            Date changed
          </button>
        ) : null}

        {/* DONE — completion timestamp + variance */}
        {t.isComplete ? (
          t.completedAt ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[var(--color-ink-muted)]">
                Completed {formatDate(t.completedAt)} at {fmtTime(t.completedAt)}
                {t.completedBy ? ` by ${t.completedBy}` : ''}
              </span>
              {v ? (
                <span className={`font-semibold ${v.cls}`}>
                  {v.days === 0
                    ? '✓ on time'
                    : v.days > 0
                    ? `▲ ${v.text}`
                    : `▼ ${v.text}`}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="italic text-[var(--color-ink-muted)]">
              Completed — exact time not recorded (imported from whiteboard)
            </p>
          )
        ) : null}

        {/* SCHEDULED — booked date */}
        {t.recorded.kind === 'scheduled' && !t.isComplete ? (
          <p className="text-sky-600 dark:text-sky-400">
            Session booked for {formatDate(t.recorded.on)}
          </p>
        ) : null}

        {/* NOT APPLICABLE — reason */}
        {t.isNotApplicable ? (
          <p className="text-[var(--color-ink-muted)]">
            {t.notApplicableReason
              ? `Not applicable — ${t.notApplicableReason}`
              : 'Not applicable for this programme'}
          </p>
        ) : null}

        {/* NOTE REQUIRED — hint before action */}
        {!t.isComplete && !t.isNotApplicable && t.requiresCompletionNote ? (
          <p className="text-amber-600 dark:text-amber-400">
            ✎&ensp;Completion note required
          </p>
        ) : null}
      </div>

      {/* ── Reopen history ── */}
      {mostRecentReopen ? (
        <div className="mt-2 rounded-md bg-amber-50/80 px-2 py-1.5 dark:bg-amber-950/20">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Reopened {formatDate(mostRecentReopen.at)} at {fmtTime(mostRecentReopen.at)}
                {mostRecentReopen.by ? ` by ${mostRecentReopen.by}` : ''}
                {t.reopens.length > 1 ? ` (+${t.reopens.length - 1} earlier)` : ''}
              </p>
              {mostRecentReopen.reason ? (
                <p className="mt-0.5 text-[10.5px] leading-snug text-amber-800 dark:text-amber-300">
                  &ldquo;{mostRecentReopen.reason}&rdquo;
                </p>
              ) : null}
            </div>
            {t.reopens.length > 1 ? (
              <button
                type="button"
                onClick={() => setShowAllReopens((v) => !v)}
                className="shrink-0 text-[9px] font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400"
              >
                {showAllReopens ? 'Hide' : 'Full history'}
              </button>
            ) : null}
          </div>
          {showAllReopens && t.reopens.length > 1 ? (
            <ul className="mt-1.5 flex flex-col gap-1 border-t border-amber-200/60 pt-1.5 dark:border-amber-800/40">
              {t.reopens.slice(1).map((r, i) => (
                <li key={i} className="text-[10px] text-amber-700 dark:text-amber-400">
                  {formatDate(r.at)} at {fmtTime(r.at)}{r.by ? ` · ${r.by}` : ''}
                  {r.reason ? (
                    <span className="block text-[10.5px] text-amber-800 dark:text-amber-300">
                      &ldquo;{r.reason}&rdquo;
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ── Complete / reopen action form ── */}
      {mode !== 'idle' ? (
        <div className="mt-2 border-t border-[var(--color-line)] pt-2">
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            {mode === 'note' ? 'Completion note (required for this action)' : 'Reason for reopening'}
          </label>
          <textarea
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
          {mode === 'reopen' ? (
            <p className="mt-0.5 text-[10px] text-[var(--color-ink-muted)]">
              This removes the completion record. The reason is kept in the audit trail.
            </p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || (mode === 'note' && !text.trim())}
              onClick={() =>
                mode === 'note'
                  ? complete()
                  : void run(() => taskService.reopen(t.id!, text))
              }
              className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
            >
              {busy ? 'Saving…' : mode === 'note' ? 'Complete' : 'Reopen'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setMode('idle'); setText(''); setError(null); }}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>
      ) : null}

      {historyOpen ? (
        <Dialog open onOpenChange={(v) => !v && setHistoryOpen(false)}>
          <DialogContent className="max-w-sm p-5">
            <DialogTitle className="text-[14px] font-semibold">Due date history</DialogTitle>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{t.title}</p>
            <div className="mt-4">
              {historyLoading ? (
                <p className="text-[12px] text-[var(--color-ink-muted)]">Loading…</p>
              ) : historyRows.length === 0 ? (
                <p className="text-[12px] text-[var(--color-ink-muted)]">No changes recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {historyRows.map((h) => (
                    <li key={h.id} className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-[11.5px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--color-ink)]">{h.changed_by_name}</span>
                        <span className="text-[10px] text-[var(--color-ink-muted)]">{formatDate(new Date(h.changed_at))} at {new Date(h.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                        {h.old_due_at ? (
                          <>
                            <span className="text-[var(--color-ink-muted)] line-through">{formatDate(new Date(h.old_due_at))}</span>
                            <span className="text-[var(--color-ink-muted)]">→</span>
                          </>
                        ) : null}
                        <span className="font-medium text-[var(--color-ink)]">{formatDate(new Date(h.new_due_at))}</span>
                      </div>
                      <p className="mt-1 text-[11px] italic text-[var(--color-ink-muted)]">&ldquo;{h.reason}&rdquo;</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="mt-4 w-full rounded-md border border-[var(--color-line)] py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Close
            </button>
          </DialogContent>
        </Dialog>
      ) : null}

      {rescheduleOpen ? (
        <Dialog open onOpenChange={(v) => !v && setRescheduleOpen(false)}>
          <DialogContent className="max-w-sm p-5">
            <DialogTitle className="text-[14px] font-semibold">Change due date</DialogTitle>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{t.title}</p>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--color-ink-muted)]">New due date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-transparent px-3 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--color-ink-muted)]">Reason (required)</label>
                <textarea
                  autoFocus
                  rows={3}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Why is this date being changed?"
                  className="mt-1 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-3 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              {rescheduleError ? <p className="text-[11px] text-red-600 dark:text-red-400">{rescheduleError}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!rescheduleDate || !rescheduleReason.trim() || rescheduleBusy}
                  onClick={() => void doReschedule()}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  {rescheduleBusy ? 'Saving…' : 'Save change'}
                </button>
                <button
                  type="button"
                  onClick={() => setRescheduleOpen(false)}
                  className="rounded-md px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
              {rescheduleHistory.length > 0 ? (
                <div className="border-t border-[var(--color-line)] pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--color-ink-muted)]">Date change history</p>
                  <ul className="mt-1.5 space-y-2">
                    {rescheduleHistory.map((h) => (
                      <li key={h.id} className="text-[10.5px] leading-snug">
                        <span className="font-semibold text-[var(--color-ink)]">{h.changed_by_name}</span>
                        {h.old_due_at ? (
                          <span className="text-[var(--color-ink-muted)]"> moved from {formatDate(new Date(h.old_due_at))} to {formatDate(new Date(h.new_due_at))}</span>
                        ) : (
                          <span className="text-[var(--color-ink-muted)]"> set to {formatDate(new Date(h.new_due_at))}</span>
                        )}
                        <span className="block text-[var(--color-ink-muted)]">{formatDate(new Date(h.changed_at))} — &ldquo;{h.reason}&rdquo;</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 py-3"
      >
        <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-[var(--color-ink)]">
          {title}
        </span>
        <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
          {count}
        </span>
        <ChevronDown
          className={`ml-auto size-3.5 shrink-0 text-[var(--color-ink-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? <div className="flex flex-col gap-2 pb-3">{children}</div> : null}
    </div>
  );
}

function DoneSection({ done, onChanged }: { done: BoardTask[]; onChanged?: (() => void) | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 border-t-2 border-emerald-200 dark:border-emerald-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 bg-emerald-50/70 px-4 py-2.5 transition hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">✓</span>
        <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-emerald-800 dark:text-emerald-300">
          Done
        </span>
        <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-800/60 dark:text-emerald-300">
          {done.length}
        </span>
        <ChevronDown
          className={`ml-auto size-3.5 shrink-0 text-emerald-600 transition-transform dark:text-emerald-400 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          {done.map((t) => (
            <TaskCard key={t.id ?? t.code} task={t} onChanged={onChanged} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function TreatmentDetailPanel({
  bed,
  centreId,
  onClose,
  onChanged,
  onPrev,
  onNext,
}: {
  bed: BoardBed;
  centreId: string;
  onClose: () => void;
  onChanged?: (() => void) | undefined;
  onPrev?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
}) {
  const { can } = useAuth();
  const [catFilter, setCatFilter] = useState<CategoryFilter>('all');
  const [concernRows, setConcernRows] = useState<ConcernRow[]>([]);
  const [showExtend, setShowExtend] = useState(false);
  const [showDischarge, setShowDischarge] = useState(false);
  const [editNotesMode, setEditNotesMode] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [concernEditId, setConcernEditId] = useState<string | null>(null);
  const [concernEditText, setConcernEditText] = useState('');
  const [concernBusy, setConcernBusy] = useState(false);
  const [concernError, setConcernError] = useState<string | null>(null);
  const [concernInfoRow, setConcernInfoRow] = useState<ConcernRow | null>(null);
  const clientId = bed.occupant?.clientId;
  useEffect(() => {
    if (!clientId) return;
    concerns.list(centreId, clientId).then(setConcernRows).catch(() => {});
  }, [centreId, clientId]);

  const o = bed.occupant;
  if (!o) return null;
  const oc = o;

  async function saveNotes() {
    if (!oc.admissionId) return;
    setNotesBusy(true);
    setNotesError(null);
    try {
      await admissions.updateNotes(oc.admissionId, notesText);
      setEditNotesMode(false);
      onChanged?.();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setNotesBusy(false);
    }
  }

  async function saveConcern() {
    if (!concernEditId) return;
    setConcernBusy(true);
    setConcernError(null);
    try {
      await concerns.updateNote(concernEditId, concernEditText);
      setConcernRows((prev) => prev.map((r) => r.id === concernEditId ? { ...r, note: concernEditText } : r));
      setConcernEditId(null);
      setConcernEditText('');
    } catch (err) {
      setConcernError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setConcernBusy(false);
    }
  }

  const tasks = [...o.tasks];

  const catCounts = Object.fromEntries(
    CAT_KEYS.map((cat) => [
      cat,
      cat === 'all' ? tasks.length : tasks.filter((t) => t.category === cat).length,
    ]),
  ) as Record<CategoryFilter, number>;

  const filtered =
    catFilter === 'all' ? tasks : tasks.filter((t) => t.category === catFilter);

  const needsAction = filtered.filter(
    (t) => (t.isOverdue || (t.isDueToday && !t.isComplete)) && !t.isNotApplicable,
  );
  needsAction.sort((a, b) => {
    if (!a.dueAt || !b.dueAt) return 0;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  const comingUp = filtered.filter(
    (t) => !t.isComplete && !t.isOverdue && !t.isDueToday && !t.isNotApplicable,
  );
  comingUp.sort((a, b) => {
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  const done = filtered.filter((t) => t.isComplete || t.isNotApplicable);
  done.sort((a, b) => {
    if (!a.completedAt) return 1;
    if (!b.completedAt) return -1;
    return b.completedAt.getTime() - a.completedAt.getTime();
  });

  const overallStatus: StatusKey =
    o.overdueCount > 0 ? 'overdue' : o.dueTodayCount > 0 ? 'attention' : 'ontrack';

  const todayPct = Math.min(100, Math.max(0, ((o.treatmentDay - 1) / o.durationDays) * 100));
  const timelineTasks = tasks.filter((t) => t.dueAt !== null);

  const navBtn =
    'flex size-7 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-ink-muted)] transition hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[1240px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">Treatment detail — {o.displayName}</DialogTitle>

          {/* ── 2-column body ── */}
          <div className="flex min-h-0 flex-1 overflow-hidden">

            {/* ══ LEFT PANEL — client context (fixed width, scrollable) ══ */}
            <div className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-line)] bg-[var(--color-surface)]">

              {/* Profile header */}
              <div className={`relative flex flex-col gap-3 p-4 ${o.hasRestrictedAlert ? 'border-b-0' : 'border-b border-[var(--color-line)]'}`}>
                {o.hasRestrictedAlert ? (
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-red-50/80 to-transparent dark:from-red-950/30" />
                ) : null}

                {/* Avatar row + nav */}
                <div className="flex items-center gap-3">
                  <button type="button" disabled={!onPrev} onClick={onPrev} className={navBtn} aria-label="Previous client">
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <PhotoBadge occupant={o} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-semibold leading-snug truncate">{o.displayName}</p>
                    <p className="nums mt-0.5 text-[10.5px] text-[var(--color-ink-muted)]">
                      Ref {o.reference} · Bed {bed.label} · {o.group || 'No group'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={overallStatus} />
                      {o.hasRestrictedAlert ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold tracking-wide text-red-700 uppercase dark:bg-red-900/40 dark:text-red-400">
                          &#9888; High risk
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button type="button" disabled={!onNext} onClick={onNext} className={navBtn} aria-label="Next client">
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>

                {/* Key facts */}
                <dl className="nums grid grid-cols-2 gap-x-4 gap-y-3 text-[11.5px]">
                  <TFact label="Admitted" value={formatDate(o.admittedAt)} />
                  <TFact label="Planned discharge" value={fmtDateStr(o.plannedDischargeDate)} />
                  <TFact label="Programme" value={`${o.durationDays} days`} />
                  <TFact label="Primary concern" value={o.substance || '—'} />
                  <TFact
                    label="Family meeting"
                    value={o.familyMeetingEligibleNow ? 'Eligible now' : `From ${formatDate(o.familyMeetingEligibleFrom)}`}
                  />
                  <TFact label="Focal therapist" value={o.therapist ?? 'Not assigned'} />
                  <TFact label="Keyworker" value={o.keyworker ?? 'Not assigned'} />
                  <TFact label="Buddy" value={o.buddy} />
                </dl>
              </div>

              {/* Programme progress */}
              <div className="border-b border-[var(--color-line)] px-4 py-3">
                <p className="text-[9.5px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">Programme progress</p>
                <p className="nums mt-1.5 text-[22px] font-semibold leading-none">
                  Day {o.treatmentDay}
                  <span className="text-[13px] text-[var(--color-ink-muted)]">/{o.durationDays}</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="brand-gradient h-full rounded-full" style={{ width: `${todayPct}%` }} />
                </div>
                <p className="nums mt-1 text-[10px] text-[var(--color-ink-muted)]">
                  {Math.round(todayPct)}% of planned stay elapsed
                </p>
                <div className="nums mt-2.5 grid grid-cols-2 gap-1.5 text-center text-[10.5px]">
                  <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-2">
                    <p className="text-[15px] font-semibold leading-none">{o.completedCount}</p>
                    <p className="mt-0.5 text-[var(--color-ink-muted)]">Done</p>
                  </div>
                  <div className={`rounded-lg border p-2 ${o.overdueCount > 0 ? 'border-overdue/60 bg-overdue-soft' : 'border-[var(--color-line)] bg-[var(--color-panel)]'}`}>
                    <p className={`text-[15px] font-semibold leading-none ${o.overdueCount > 0 ? 'text-overdue' : ''}`}>{o.overdueCount}</p>
                    <p className="mt-0.5 text-[var(--color-ink-muted)]">Overdue</p>
                  </div>
                </div>
              </div>

              {/* Stay timeline */}
              <div className="border-b border-[var(--color-line)] px-4 py-3">
                <p className="text-[9.5px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">Stay timeline</p>
                <div className="mt-2 mb-1.5 flex items-baseline justify-between text-[10px] text-[var(--color-ink-muted)]">
                  <span>{formatDate(o.admittedAt)}</span>
                  <span>{fmtDateStr(o.plannedDischargeDate)}</span>
                </div>
                <div className="relative h-3.5 overflow-visible rounded-full bg-black/[0.06] dark:bg-white/10">
                  <div className="brand-gradient absolute left-0 top-0 h-full rounded-full opacity-40" style={{ width: `${todayPct}%` }} />
                  {/* Only render meaningful dots — skip plain grey upcoming tasks */}
                  {timelineTasks
                    .filter((t) => t.isComplete || t.isOverdue || t.isDueToday || t.recorded.kind === 'scheduled')
                    .map((t, i) => {
                      const pct = Math.min(100, Math.max(0, (calendarDaysBetween(o.admittedAt, t.dueAt!, TZ) / o.durationDays) * 100));
                      return (
                        <span
                          key={i}
                          title={`${t.title} — Due ${formatDate(t.dueAt!)}`}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-default"
                          style={{ left: `${pct}%` }}
                        >
                          <span className="block size-3 rounded-full ring-2 ring-white dark:ring-[var(--color-panel)]" style={{ backgroundColor: dotColor(t) }} />
                        </span>
                      );
                    })}
                  <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${todayPct}%` }}>
                    <span className="block h-7 w-0.5 rounded-full bg-[var(--color-accent)]" />
                  </span>
                </div>
                {/* Colour legend only — counts already shown in Programme Progress above */}
                <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--color-ink-muted)]">
                  <span className="flex items-center gap-1"><span className="block size-2 rounded-full bg-[#1D9E75]" />Done</span>
                  <span className="flex items-center gap-1"><span className="block size-2 rounded-full bg-[#E24B4A]" />Overdue</span>
                  <span className="flex items-center gap-1"><span className="block size-2 rounded-full bg-[#EF9F27]" />Due today</span>
                  <span className="flex items-center gap-1"><span className="block size-2 rounded-full bg-[#85B7EB]" />Booked</span>
                </div>
              </div>

              {/* Safeguarding / Risks / Concerns */}
              <div className="border-b border-[var(--color-line)] px-4 py-3">
                <div className={`rounded-lg border-l-4 px-3 py-2 ${
                  o.hasRestrictedAlert
                    ? 'border border-red-300 border-l-red-600 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
                    : (o.hasOpenConcern || o.legacySafeguardingNote)
                    ? 'border border-amber-200 border-l-amber-500 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/30'
                    : 'border border-[var(--color-line)] border-l-[var(--color-line)] bg-[var(--color-panel)]'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold tracking-[0.05em] uppercase ${
                      o.hasRestrictedAlert ? 'text-red-700 dark:text-red-400'
                      : (o.hasOpenConcern || o.legacySafeguardingNote) ? 'text-amber-700 dark:text-amber-400'
                      : 'text-[var(--color-ink-muted)]'
                    }`}>Safeguarding / Risks / Concerns</span>
                    {o.hasRestrictedAlert ? (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">Alert</span>
                    ) : o.hasOpenConcern ? (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">Open</span>
                    ) : null}
                  </div>
                  {concernRows.length > 0 ? (
                    <ul className="mt-1 space-y-1.5">
                      {concernRows.map((r) => (
                        <li key={r.id} className={`text-[11px] leading-snug ${r.is_resolved ? 'opacity-50' : ''}`}>
                          <div className="flex items-start gap-1">
                            <div className="flex-1">
                              <span className={`mr-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                                r.category === 'risk' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : r.category === 'medical' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              }`}>{CONCERN_LABEL[r.category]}</span>
                              {concernEditId === r.id ? (
                                <div className="mt-1">
                                  <textarea
                                    autoFocus
                                    rows={3}
                                    value={concernEditText}
                                    onChange={(e) => setConcernEditText(e.target.value)}
                                    className="w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[11px] outline-none focus:border-[var(--color-accent)]"
                                  />
                                  {concernError ? <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">{concernError}</p> : null}
                                  <div className="mt-1 flex gap-2">
                                    <button type="button" disabled={!concernEditText.trim() || concernBusy}
                                      onClick={() => void saveConcern()}
                                      className="rounded-md bg-[var(--color-accent)] px-2 py-0.5 text-[10.5px] font-medium text-white disabled:opacity-40">
                                      {concernBusy ? 'Saving…' : 'Save'}
                                    </button>
                                    <button type="button" onClick={() => { setConcernEditId(null); setConcernError(null); }}
                                      className="rounded-md px-2 py-0.5 text-[10.5px] text-[var(--color-ink-muted)] hover:bg-black/5 dark:hover:bg-white/10">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className={o.hasRestrictedAlert ? 'text-red-700 dark:text-red-300' : o.hasOpenConcern ? 'text-amber-800 dark:text-amber-200' : 'text-[var(--color-ink)]'}>{r.note}</span>
                              )}
                              <span className="ml-2 text-[10px] text-[var(--color-ink-muted)]">{formatDate(new Date(r.logged_at))}</span>
                              {r.is_resolved && <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">Resolved</span>}
                              {r.updated_by_name && !r.is_resolved && concernEditId !== r.id ? (
                                <span className="ml-2 text-[9px] italic text-[var(--color-ink-muted)]">edited</span>
                              ) : null}
                            </div>
                            {!r.is_resolved && can('tasks.complete') && concernEditId !== r.id ? (
                              <div className="flex shrink-0 items-center gap-0.5 pl-1">
                                <button type="button" title="Edit note"
                                  onClick={() => { setConcernEditId(r.id); setConcernEditText(r.note); setConcernError(null); }}
                                  className="rounded p-0.5 text-[var(--color-ink-muted)] hover:bg-black/8 dark:hover:bg-white/10">
                                  <Pencil className="size-2.5" />
                                </button>
                                {r.updated_by_name ? (
                                  <button type="button" title="Edit history"
                                    onClick={() => setConcernInfoRow(r)}
                                    className="rounded p-0.5 text-[var(--color-ink-muted)] hover:bg-black/8 dark:hover:bg-white/10">
                                    <Info className="size-2.5" />
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : o.legacySafeguardingNote ? (
                    <p className={`mt-0.5 text-[11px] ${o.hasRestrictedAlert ? 'font-medium text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-200'}`}>{o.legacySafeguardingNote}</p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">No notes on file.</p>
                  )}
                </div>
              </div>

              {/* Admission notes */}
              <div className="border-b border-[var(--color-line)] px-4 py-3">
                <div className="rounded-lg border border-[var(--color-line)] border-l-4 border-l-[var(--color-accent)]/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold tracking-[0.05em] text-[var(--color-ink-muted)] uppercase">Admission notes</p>
                    {can('tasks.complete') && !editNotesMode ? (
                      <button type="button" title="Edit notes"
                        onClick={() => { setNotesText(o.admissionNotes ?? ''); setEditNotesMode(true); setNotesError(null); }}
                        className="ml-auto rounded p-0.5 text-[var(--color-ink-muted)] hover:bg-black/8 dark:hover:bg-white/10">
                        <Pencil className="size-3" />
                      </button>
                    ) : null}
                  </div>
                  {editNotesMode ? (
                    <div className="mt-1.5">
                      <textarea
                        autoFocus
                        rows={4}
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        placeholder="Add admission notes…"
                        className="w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[11px] outline-none focus:border-[var(--color-accent)]"
                      />
                      {notesError ? <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">{notesError}</p> : null}
                      <div className="mt-1.5 flex gap-2">
                        <button type="button" disabled={notesBusy}
                          onClick={() => void saveNotes()}
                          className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40">
                          {notesBusy ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => { setEditNotesMode(false); setNotesError(null); }}
                          className="rounded-md px-2.5 py-1 text-[11px] text-[var(--color-ink-muted)] hover:bg-black/5 dark:hover:bg-white/10">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : o.admissionNotes ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-[var(--color-ink)]">{o.admissionNotes}</p>
                  ) : (
                    <p className="mt-0.5 text-[11px] italic text-[var(--color-ink-muted)]">No notes recorded.</p>
                  )}
                </div>
              </div>

              {/* Extend Stay + Discharge buttons */}
              {o.admissionId ? (
                <div className="mt-auto border-t border-[var(--color-line)] p-4">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setShowExtend(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                    >
                      <CalendarPlus className="size-4 shrink-0" />
                      Extend stay
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDischarge(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--color-ink)] transition hover:border-red-400 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-700 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <ArrowRightFromLine className="size-4 shrink-0" />
                      Discharge workflow
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* ══ RIGHT PANEL — tasks & therapy actions ══ */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

              {/* Category filter bar — sticky at top */}
              <div className="shrink-0 border-b border-[var(--color-line)] px-4 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {CAT_KEYS.filter((cat) => cat === 'all' || catCounts[cat] > 0).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCatFilter(cat)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                        catFilter === cat
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                      }`}
                    >
                      {CAT_LABELS[cat]}
                      <span className={`rounded-full px-1 text-[9px] font-bold ${catFilter === cat ? 'bg-white/20 text-white' : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'}`}>
                        {catCounts[cat]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Task body — Needs action + Coming up side by side, Done below */}
              <div className="min-h-0 flex-1 overflow-hidden flex flex-col">

                {/* Two active columns */}
                <div className="min-h-0 flex-1 grid grid-cols-2 divide-x divide-[var(--color-line)] overflow-hidden">

                  {/* Left — Needs action */}
                  <div className="overflow-y-auto px-4 py-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--color-ink)]">
                        Needs action
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                        needsAction.length > 0
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                          : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      }`}>
                        {needsAction.length}
                      </span>
                    </div>
                    {needsAction.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {needsAction.map((t) => (
                          <TaskCard key={t.id ?? t.code} task={t} onChanged={onChanged} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12.5px] text-[var(--color-ink-muted)]">All clear — nothing overdue or due today.</p>
                    )}
                  </div>

                  {/* Right — Coming up */}
                  <div className="overflow-y-auto px-4 py-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--color-ink)]">
                        Coming up
                      </span>
                      <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-accent)]">
                        {comingUp.length}
                      </span>
                    </div>
                    {comingUp.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {comingUp.map((t) => (
                          <TaskCard key={t.id ?? t.code} task={t} onChanged={onChanged} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12.5px] text-[var(--color-ink-muted)]">Nothing scheduled.</p>
                    )}
                  </div>
                </div>

                {/* Done — full width, collapsed by default, prominent green header */}
                {done.length > 0 ? (
                  <DoneSection done={done} onChanged={onChanged} />
                ) : null}

                {filtered.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-[var(--color-ink-muted)]">
                    No {catFilter === 'all' ? '' : CAT_LABELS[catFilter].toLowerCase() + ' '}tasks recorded.
                  </p>
                ) : null}

              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Extend Stay overlay ── */}
      {showExtend && o.admissionId ? (
        <Dialog open onOpenChange={(open) => !open && setShowExtend(false)}>
          <DialogContent className="w-full max-w-[480px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
            <DialogTitle className="sr-only">Extend stay — {o.displayName}</DialogTitle>
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
              <div>
                <p className="font-semibold text-[13.5px]">Extend stay</p>
                <p className="text-[11px] text-[var(--color-ink-muted)]">{o.displayName}</p>
              </div>
              <button type="button" onClick={() => setShowExtend(false)} className="flex size-7 items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-muted/60">
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <ExtendStayCard occupant={o} onChanged={onChanged} />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* ── Concern edit-history popup ── */}
      {concernInfoRow ? (
        <Dialog open onOpenChange={(v) => !v && setConcernInfoRow(null)}>
          <DialogContent className="max-w-xs p-5">
            <DialogTitle className="text-[13px] font-semibold">Last edited by</DialogTitle>
            <div className="mt-3 space-y-1 text-[12px]">
              <p><span className="font-semibold text-[var(--color-ink)]">{concernInfoRow.updated_by_name}</span></p>
              {concernInfoRow.updated_at ? (
                <p className="text-[var(--color-ink-muted)]">
                  {formatDate(new Date(concernInfoRow.updated_at))} at {new Date(concernInfoRow.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={() => setConcernInfoRow(null)}
              className="mt-4 w-full rounded-md border border-[var(--color-line)] py-1.5 text-[12px] text-[var(--color-ink-muted)] hover:bg-black/5 dark:hover:bg-white/10">
              Close
            </button>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* ── Discharge Workflow overlay ── */}
      {showDischarge && o.admissionId ? (
        <Dialog open onOpenChange={(open) => !open && setShowDischarge(false)}>
          <DialogContent className="w-full max-w-[480px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
            <DialogTitle className="sr-only">Discharge workflow — {o.displayName}</DialogTitle>
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
              <div>
                <p className="font-semibold text-[13.5px]">Discharge workflow</p>
                <p className="text-[11px] text-[var(--color-ink-muted)]">{o.displayName}</p>
              </div>
              <button type="button" onClick={() => setShowDischarge(false)} className="flex size-7 items-center justify-center rounded-lg text-[var(--color-ink-muted)] hover:bg-muted/60">
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <DischargeWorkflowCard occupant={o} onChanged={onChanged} />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
