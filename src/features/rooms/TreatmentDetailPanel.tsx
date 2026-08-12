import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BoardBed, BoardTask } from './board-data.js';
import { formatDate } from '../../lib/format.js';
import { StatusBadge, type StatusKey } from '../../components/status-badge.tsx';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { tasks as taskService } from '../../services/data-access.js';
import { ConcernSection } from './ConcernSection.tsx';
import { PhotoBadge } from './BedCard.tsx';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { calendarDaysBetween } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

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

  const isReal = t.id !== null;
  const canComplete = isReal && !t.isComplete && !t.isNotApplicable && can('tasks.complete');
  const canReopen = isReal && t.isComplete && can('tasks.reopen');
  const v = variance(t);

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
  const [catFilter, setCatFilter] = useState<CategoryFilter>('all');

  const o = bed.occupant;
  if (!o) return null;

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
  // Sort overdue tasks by most overdue first (largest daysOverdue first).
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
    return b.completedAt.getTime() - a.completedAt.getTime(); // most recently done first
  });

  const overallStatus: StatusKey =
    o.overdueCount > 0 ? 'overdue' : o.dueTodayCount > 0 ? 'attention' : 'ontrack';

  const todayPct = Math.min(100, Math.max(0, ((o.treatmentDay - 1) / o.durationDays) * 100));
  const timelineTasks = tasks.filter((t) => t.dueAt !== null);

  const navBtn =
    'flex size-8 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-ink-muted)] transition hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-[900px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Treatment detail — {o.displayName}</DialogTitle>

        {/* ── Pinned header ── */}
        <div className="shrink-0 border-b border-[var(--color-line)] px-4 pb-0 pt-4">
          <div className="flex items-center gap-3 pr-10">
            <div className="flex items-center gap-1">
              <button type="button" disabled={!onPrev} onClick={onPrev} className={navBtn} aria-label="Previous client">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" disabled={!onNext} onClick={onNext} className={navBtn} aria-label="Next client">
                <ChevronRight className="size-4" />
              </button>
            </div>

            <PhotoBadge occupant={o} size="md" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-[17px] font-semibold leading-tight">{o.displayName}</span>
                <StatusBadge status={overallStatus} />
                {o.hasRestrictedAlert ? (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                    Safeguarding alert
                  </span>
                ) : null}
              </div>
              <div className="nums text-[11px] text-[var(--color-ink-muted)]">
                Ref {o.reference} &middot; Bed {bed.label} &middot; {o.group || 'No group'}{' '}
                &middot; {o.substance || '—'}
              </div>
            </div>
          </div>

          {/* Key facts strip */}
          <div className="nums mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 pb-3 text-[12px]">
            <span>
              <span className="text-[var(--color-ink-muted)]">Day </span>
              <strong className="font-semibold">{o.treatmentDay}</strong>
              <span className="text-[var(--color-ink-muted)]">/{o.durationDays}</span>
            </span>
            <span>
              <span className="text-[var(--color-ink-muted)]">Admitted </span>
              {formatDate(o.admittedAt)}
            </span>
            <span>
              <span className="text-[var(--color-ink-muted)]">Discharge </span>
              {fmtDateStr(o.plannedDischargeDate)}
            </span>
            <span>
              <span className="text-[var(--color-ink-muted)]">Therapist </span>
              {o.therapist ?? (
                <span className="text-amber-600 dark:text-amber-400">Not assigned</span>
              )}
            </span>
            <span>
              <span className="text-[var(--color-ink-muted)]">Keyworker </span>
              {o.keyworker ?? '—'}
            </span>
            <span>
              <span className="text-[var(--color-ink-muted)]">Tasks </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{o.completedCount} done</span>
              {o.overdueCount > 0 ? (
                <span className="ml-1 font-semibold text-red-600 dark:text-red-400">· {o.overdueCount} overdue</span>
              ) : null}
              {o.dueTodayCount > 0 ? (
                <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">· {o.dueTodayCount} due today</span>
              ) : null}
            </span>
          </div>
        </div>

        {/* ── Stay timeline ── */}
        <div className="shrink-0 border-b border-[var(--color-line)] px-4 pb-3 pt-3">

          {/* Date anchors + day counter */}
          <div className="mb-2 flex items-baseline justify-between text-[10.5px]">
            <span className="text-[var(--color-ink-muted)]">
              <span className="text-[9px] font-semibold uppercase tracking-wider">Admitted </span>
              {formatDate(o.admittedAt)}
            </span>
            <span className="text-[12px] font-semibold">
              Day {o.treatmentDay}
              <span className="font-normal text-[var(--color-ink-muted)]"> / {o.durationDays}</span>
            </span>
            <span className="text-right text-[var(--color-ink-muted)]">
              <span className="text-[9px] font-semibold uppercase tracking-wider">Discharge </span>
              {fmtDateStr(o.plannedDischargeDate)}
            </span>
          </div>

          {/* Track */}
          <div className="relative h-4 overflow-visible rounded-full bg-black/[0.06] dark:bg-white/10">
            {/* Progress fill */}
            <div
              className="brand-gradient absolute left-0 top-0 h-full rounded-full opacity-40"
              style={{ width: `${todayPct}%` }}
            />
            {/* Task dots — larger + ring so they read clearly even when clustered */}
            {timelineTasks.map((t, i) => {
              const pct = Math.min(
                100,
                Math.max(0, (calendarDaysBetween(o.admittedAt, t.dueAt!, TZ) / o.durationDays) * 100),
              );
              return (
                <span
                  key={i}
                  title={`${t.title} — Due ${formatDate(t.dueAt!)}`}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-default"
                  style={{ left: `${pct}%` }}
                >
                  <span
                    className="block size-3.5 rounded-full ring-2 ring-white dark:ring-[var(--color-panel)]"
                    style={{ backgroundColor: dotColor(t) }}
                  />
                </span>
              );
            })}
            {/* Today marker */}
            <span
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${todayPct}%` }}
            >
              <span className="block h-8 w-0.5 rounded-full bg-[var(--color-accent)]" />
            </span>
          </div>

          {/* Stat chips — double as the legend */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatPill color="#1D9E75" count={o.completedCount} label="done" />
            <StatPill color="#E24B4A" count={o.overdueCount} label="overdue" />
            <StatPill color="#EF9F27" count={o.dueTodayCount} label="due today" />
            <StatPill
              color="#B4B2A9"
              count={tasks.filter((t) => !t.isComplete && !t.isOverdue && !t.isDueToday && !t.isNotApplicable).length}
              label="upcoming"
            />
            <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-ink-muted)]">
              <span className="block h-3.5 w-0.5 rounded-full bg-[var(--color-accent)]" />
              Today
            </span>
          </div>
        </div>

        {/* ── Category filter pills ── */}
        <div className="shrink-0 border-b border-[var(--color-line)] px-4 py-2">
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
                <span
                  className={`rounded-full px-1 text-[9px] font-bold ${
                    catFilter === cat
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  }`}
                >
                  {catCounts[cat]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable task body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="divide-y divide-[var(--color-line)] px-4">
            {needsAction.length > 0 ? (
              <Section title="Needs action" count={needsAction.length} defaultOpen>
                {needsAction.map((t) => (
                  <TaskCard key={t.id ?? t.code} task={t} onChanged={onChanged} />
                ))}
              </Section>
            ) : null}

            {comingUp.length > 0 ? (
              <Section title="Coming up" count={comingUp.length} defaultOpen={false}>
                {comingUp.map((t) => (
                  <TaskCard key={t.id ?? t.code} task={t} onChanged={onChanged} />
                ))}
              </Section>
            ) : null}

            {done.length > 0 ? (
              <Section title="Done" count={done.length} defaultOpen={false}>
                {done.map((t) => (
                  <TaskCard key={t.id ?? t.code} task={t} onChanged={onChanged} />
                ))}
              </Section>
            ) : null}

            {filtered.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--color-ink-muted)]">
                No {catFilter === 'all' ? '' : CAT_LABELS[catFilter].toLowerCase() + ' '}tasks recorded.
              </p>
            ) : null}

            {o.admissionId && o.clientId ? (
              <div className="py-3">
                <ConcernSection
                  clientId={o.clientId}
                  admissionId={o.admissionId}
                  centreId={centreId}
                  compact
                />
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
