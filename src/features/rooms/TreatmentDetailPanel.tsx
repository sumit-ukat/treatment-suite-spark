import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BoardBed, BoardTask } from './board-data.js';
import { formatDate } from '../../lib/format.js';
import { Chip } from '../../components/ui.tsx';
import { StatusBadge, type StatusKey } from '../../components/status-badge.tsx';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { tasks as taskService } from '../../services/data-access.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { calendarDaysBetween } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

type CategoryFilter = 'all' | 'family_contact' | 'milestone' | 'session' | 'survey' | 'medical';

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

function varianceLabel(t: BoardTask): { text: string; cls: string } | null {
  if (!t.isComplete || !t.completedAt || !t.dueAt) return null;
  const days = calendarDaysBetween(t.dueAt, t.completedAt, TZ);
  if (days === 0) return { text: 'on time', cls: 'text-emerald-600 dark:text-emerald-400' };
  if (days > 0) return { text: `${days}d late`, cls: 'text-amber-600 dark:text-amber-400' };
  return { text: `${Math.abs(days)}d early`, cls: 'text-emerald-600 dark:text-emerald-400' };
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
  const [showReopens, setShowReopens] = useState(false);

  const isReal = t.id !== null;
  const canComplete = isReal && !t.isComplete && !t.isNotApplicable && can('tasks.complete');
  const canReopen = isReal && t.isComplete && can('tasks.reopen');
  const variance = varianceLabel(t);

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

  const borderCls = t.isOverdue
    ? 'border-l-[3px] border-l-red-500 border-red-200/60 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
    : t.isDueToday && !t.isComplete
    ? 'border-l-[3px] border-l-amber-400 border-amber-200/50 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/20'
    : 'border-[var(--color-line)]';

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${borderCls}`}>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p
            className={`text-[13px] leading-snug ${
              t.isComplete ? 'line-through text-[var(--color-ink-muted)]' : 'font-medium'
            }`}
          >
            {t.title}
          </p>
          <div className="nums mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-[var(--color-ink-muted)]">
            {t.dueAt ? <span>Due {formatDate(t.dueAt)}</span> : <span>No due date</span>}
            {t.isComplete && t.completedAt ? (
              <>
                <span>·</span>
                <span>
                  Done {formatDate(t.completedAt)} {fmtTime(t.completedAt)}
                  {t.completedBy ? ` by ${t.completedBy}` : ''}
                </span>
                {variance ? (
                  <>
                    <span>·</span>
                    <span className={variance.cls}>{variance.text}</span>
                  </>
                ) : null}
              </>
            ) : null}
            {!t.isComplete && t.recorded.kind === 'scheduled' ? (
              <Chip label="Booked" tone="neutral" />
            ) : null}
          </div>
          {t.reopens.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowReopens((v) => !v)}
              className="nums mt-1 text-left text-[10px] font-medium text-amber-700 underline underline-offset-2 dark:text-amber-400"
            >
              Reopened {t.reopens.length === 1 ? 'once' : `${t.reopens.length}×`}{' '}
              {showReopens ? '▴' : '▾'}
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {t.isOverdue ? (
            <StatusBadge status="overdue" label="Overdue" size="sm" />
          ) : t.isDueToday && !t.isComplete ? (
            <StatusBadge status="attention" label="Today" size="sm" />
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

      {showReopens ? (
        <ul className="mt-2 flex flex-col gap-1 border-t border-[var(--color-line)] pt-2">
          {t.reopens.map((r, i) => (
            <li key={i} className="rounded bg-amber-500/[0.06] px-2 py-1.5">
              <p className="nums text-[10px] text-[var(--color-ink-muted)]">
                {formatDate(r.at)}{r.by ? ` · ${r.by}` : ''}
              </p>
              {r.reason ? (
                <p className="mt-0.5 text-[11.5px] leading-snug">{r.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {mode !== 'idle' ? (
        <div className="mt-2 border-t border-[var(--color-line)] pt-2">
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            {mode === 'note' ? 'Completion note (required)' : 'Reason for reopening'}
          </label>
          <textarea
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
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
            <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">
              {error}
            </p>
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
          className={`ml-auto size-3.5 shrink-0 text-[var(--color-ink-muted)] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? <div className="flex flex-col gap-2 pb-3">{children}</div> : null}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function TreatmentDetailPanel({
  bed,
  centreId: _centreId,
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
  const comingUp = filtered.filter(
    (t) => !t.isComplete && !t.isOverdue && !t.isDueToday && !t.isNotApplicable,
  );
  const done = filtered.filter((t) => t.isComplete || t.isNotApplicable);

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
          {/* Identity row */}
          <div className="flex items-center gap-3 pr-10">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!onPrev}
                onClick={onPrev}
                className={navBtn}
                aria-label="Previous client"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                disabled={!onNext}
                onClick={onNext}
                className={navBtn}
                aria-label="Next client"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[13px] font-bold text-[var(--color-accent)]">
              {o.initials}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-[17px] font-semibold leading-tight">
                  {o.displayName}
                </span>
                <StatusBadge status={overallStatus} />
                {o.hasRestrictedAlert ? (
                  <Chip icon="⚑" label="Alert" tone="alert" />
                ) : null}
              </div>
              <div className="nums text-[11px] text-[var(--color-ink-muted)]">
                Ref {o.reference} &middot; Bed {bed.label} &middot; {o.group || 'No group'}{' '}
                &middot; {o.substance || '—'}
              </div>
            </div>
          </div>

          {/* Key facts */}
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
          </div>
        </div>

        {/* ── Timeline bar ── */}
        <div className="shrink-0 border-b border-[var(--color-line)] px-4 py-3">
          <div className="relative mb-2 h-2.5 overflow-visible rounded-full bg-black/[0.06] dark:bg-white/10">
            {/* Progress fill */}
            <div
              className="brand-gradient absolute left-0 top-0 h-full rounded-full opacity-50"
              style={{ width: `${todayPct}%` }}
            />
            {/* Task dots */}
            {timelineTasks.map((t, i) => {
              const pct = Math.min(
                100,
                Math.max(
                  0,
                  (calendarDaysBetween(o.admittedAt, t.dueAt!, TZ) / o.durationDays) * 100,
                ),
              );
              return (
                <span
                  key={i}
                  title={`${t.title} — ${formatDate(t.dueAt!)}`}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pct}%` }}
                >
                  <span
                    className="block size-2.5 rounded-full ring-[1.5px] ring-white dark:ring-[var(--color-panel)]"
                    style={{ backgroundColor: dotColor(t) }}
                  />
                </span>
              );
            })}
            {/* Today marker */}
            <span
              className="absolute top-1/2 -translate-x-1/2"
              style={{ left: `${todayPct}%` }}
            >
              <span className="block h-5 w-[2px] -translate-y-[6px] bg-[var(--color-accent)]" />
            </span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[10px] text-[var(--color-ink-muted)]">
            {([
              { bg: '#E24B4A', label: 'Overdue' },
              { bg: '#1D9E75', label: 'Done' },
              { bg: '#EF9F27', label: 'Due today / done late' },
              { bg: '#85B7EB', label: 'Booked' },
              { bg: '#B4B2A9', label: 'Upcoming' },
            ] as const).map(({ bg, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="block size-1.5 rounded-full" style={{ backgroundColor: bg }} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="block h-2.5 w-px bg-[var(--color-accent)]" />
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
                No{' '}
                {catFilter === 'all'
                  ? ''
                  : CAT_LABELS[catFilter].toLowerCase() + ' '}
                tasks recorded.
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
