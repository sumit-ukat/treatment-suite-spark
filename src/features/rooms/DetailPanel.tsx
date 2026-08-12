import { useEffect, useRef, useState } from 'react';
import type { BoardBed, BoardTask, Occupant } from './board-data.js';
import { ExtendStayCard } from './ExtendStayCard.tsx';
import { formatDate, formatDateWithDay } from '../../lib/format.js';
import { formatBytes } from '../../lib/image.js';
import { PhotoBadge } from './BedCard.tsx';
import { Panel, Timeline } from '../../components/ui.tsx';
import { StatusBadge, type StatusKey } from '../../components/status-badge.tsx';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { clientPhotos, concerns, tasks as taskService, type ConcernRow } from '../../services/data-access.js';
import { DischargeWorkflowCard } from './DischargeWorkflowCard.tsx';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { calendarDaysBetween } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

// TODO: same scoped simplification as real-board-data.ts — every configured centre today is
// Europe/London.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;


const CONCERN_LABEL: Record<string, string> = {
  behaviour: 'Behaviour',
  risk: 'Risk',
  medical: 'Medical',
  welfare: 'Welfare',
  general: 'General',
};

const CATEGORY_LABEL: Record<string, string> = {
  family_contact: 'Family contact',
  milestone: 'Treatment milestone',
  session: 'Session',
  medical: 'Medical',
  survey: 'Survey',
  discharge: 'Discharge',
  admin: 'Admin',
};

/**
 * The client file, redesigned to match the source layout: a centred dialog rather than a right-hand
 * drawer, with identity/facts/progress across the top and a two-column body below (discharge +
 * treatment journey on the left, required actions on the right).
 *
 * Two facts the source mockup shows that this component deliberately omits: pronoun and funding
 * route. Neither exists anywhere in the real schema (clients has no pronoun column; no table records
 * a funding route at all), and every other value here is real — adding two fabricated facts to an
 * otherwise honest panel would be worse than leaving a gap. `date_of_birth` does exist on `clients`
 * but is never collected for any client in this database yet, so showing "Born —" for literally every
 * record would be noise, not signal; it can be added back the day it is actually populated.
 */
export function DetailPanel({
  bed,
  centreId,
  onClose,
  onChanged,
}: {
  bed: BoardBed;
  centreId: string;
  onClose: () => void;
  /**
   * Called after a task completion/reopen or a discharge action lands, so the board re-reads rather
   * than guessing the new state — a discharge in particular changes which bed this occupant is even
   * on (none, once discharged), which is not something to reconstruct locally.
   */
  onChanged?: (() => void) | undefined;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [concernRows, setConcernRows] = useState<ConcernRow[]>([]);
  const clientId = bed.occupant?.clientId;
  useEffect(() => {
    if (!clientId) return;
    concerns.list(centreId, clientId).then(setConcernRows).catch(() => {});
  }, [centreId, clientId]);

  const o = bed.occupant;
  if (!o) return null;

  const sorted = [...o.tasks].sort((a, b) => {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  // The programme's own fixed-order steps (life story, Step 1/2/3, CCP) — a subset of `sorted`, kept
  // in the same due-date order, rather than a separate notion of "stage" invented for this view.
  const milestones = sorted.filter((t) => t.category === 'milestone');
  const milestoneSteps = milestones.map((t) => ({
    label: t.title,
    date: t.dueAt ? formatDate(t.dueAt) : undefined,
    tone: t.isComplete ? ('good' as const) : t.isOverdue ? ('alert' as const) : t.isDueToday ? ('warn' as const) : ('neutral' as const),
  }));

  const overallStatus: StatusKey =
    o.overdueCount > 0 ? 'overdue' : o.dueTodayCount > 0 ? 'attention' : 'ontrack';
  const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[94vh] w-full max-w-[1280px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Client file — {o.displayName}</DialogTitle>

        {/* 3-column header:
            [profile card] | [key facts + safeguarding status] | [progress card] */}
        <div className="grid grid-cols-1 gap-5 border-b border-[var(--color-line)] p-5 lg:grid-cols-[200px_minmax(0,1fr)_260px]">

          {/* Col 1 — Profile card: photo, name, status, high-risk, ref */}
          <div
            className={`relative flex flex-col items-center gap-2.5 overflow-hidden rounded-xl p-3 text-center ${
              o.hasRestrictedAlert
                ? 'border-t-[3px] border-t-red-400 dark:border-t-red-500'
                : ''
            }`}
          >
            {o.hasRestrictedAlert ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-xl bg-gradient-to-b from-red-50/80 to-transparent dark:from-red-950/30" />
            ) : null}
            {o.photoUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="rounded-full transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                aria-label={`View ${o.displayName}'s photograph full size`}
              >
                <PhotoBadge occupant={o} size="xl" />
              </button>
            ) : (
              <PhotoBadge occupant={o} size="xl" />
            )}

            <div className="flex flex-col items-center gap-1.5">
              <h2 className="font-display text-[17px] font-semibold leading-snug">{o.displayName}</h2>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <StatusBadge status={overallStatus} />
                {o.hasRestrictedAlert ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-red-700 uppercase dark:bg-red-900/40 dark:text-red-400">
                    &#9888; High risk
                  </span>
                ) : null}
              </div>
              <div className="nums text-[11px] text-[var(--color-ink-muted)]">
                Ref {o.reference} &middot; Bed {bed.label} &middot; {o.group || 'No group'}
              </div>
            </div>

            {o.clientId ? (
              <PhotoUpload
                centreId={centreId}
                clientId={o.clientId}
                hasPhoto={o.photoState === 'present'}
                onUploaded={onChanged}
              />
            ) : null}
          </div>

          {/* Col 2 — Key facts grid + safeguarding status banner */}
          <div className="min-w-0">
            <dl className="nums grid grid-cols-2 gap-x-6 gap-y-3.5 text-[12.5px] sm:grid-cols-4">
              <Fact label="Admitted" value={formatDate(o.admittedAt)} />
              <Fact label="Planned discharge" value={formatDate(o.plannedDischargeDate)} />
              <Fact label="Programme" value={`${o.durationDays} days`} />
              <Fact label="Primary concern" value={o.substance || '—'} />
              <Fact
                label="Family meeting"
                value={o.familyMeetingEligibleNow ? 'Eligible now' : `From ${formatDate(o.familyMeetingEligibleFrom)}`}
              />
              <Fact label="Focal therapist" value={o.therapist ?? 'Not assigned'} />
              <Fact label="Keyworker" value={o.keyworker ?? 'Not assigned'} />
              <Fact label="Buddy" value={o.buddy} />
            </dl>

            {/* Safeguarding / Risks / Concerns — status only, no concern cards */}
            <div
              className={`mt-4 rounded-lg border-l-4 px-3 py-2.5 ${
                o.hasRestrictedAlert
                  ? 'border border-red-300 border-l-red-600 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
                  : o.hasOpenConcern
                  ? 'border border-amber-200 border-l-amber-500 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/30'
                  : 'border border-[var(--color-line)] border-l-[var(--color-line)] bg-[var(--color-surface)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10.5px] font-semibold tracking-[0.05em] uppercase ${
                    o.hasRestrictedAlert
                      ? 'text-red-700 dark:text-red-400'
                      : o.hasOpenConcern
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-[var(--color-ink-muted)]'
                  }`}
                >
                  Safeguarding / Risks / Concerns
                </span>
                {o.hasRestrictedAlert ? (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                    Alert
                  </span>
                ) : o.hasOpenConcern ? (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                    Open
                  </span>
                ) : null}
              </div>
              {concernRows.length > 0 ? (
                <ul className="mt-1.5 space-y-1.5">
                  {concernRows.map((r) => (
                    <li key={r.id} className={`text-[11.5px] leading-snug ${r.is_resolved ? 'opacity-50' : ''}`}>
                      <span className={`mr-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                        r.category === 'risk'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : r.category === 'medical'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>{CONCERN_LABEL[r.category]}</span>
                      <span className={o.hasRestrictedAlert ? 'text-red-700 dark:text-red-300' : o.hasOpenConcern ? 'text-amber-800 dark:text-amber-200' : 'text-[var(--color-ink)]'}>{r.note}</span>
                      <span className="ml-2 text-[10px] text-[var(--color-ink-muted)]">{formatDate(new Date(r.logged_at))}</span>
                      {r.is_resolved && <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">Resolved</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
                  No notes on file.
                </p>
              )}
            </div>
          </div>

          {/* Col 3 — Programme progress */}
          <div className="h-fit rounded-xl border border-[var(--color-line)] p-4">
            <p className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
              Programme progress
            </p>
            <p className="nums mt-2 text-[26px] font-semibold leading-none">
              Day {o.treatmentDay}
              <span className="text-[15px] text-[var(--color-ink-muted)]">/{o.durationDays}</span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="brand-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="nums mt-1.5 text-[10.5px] text-[var(--color-ink-muted)]">
              {pct}% of the planned stay elapsed
            </p>
            <div className="nums mt-3.5 grid grid-cols-2 gap-2 text-center text-[11px]">
              <div className="rounded-lg border border-[var(--color-line)] p-2.5">
                <p className="text-[17px] font-semibold leading-none">{o.completedCount}</p>
                <p className="mt-1 text-[var(--color-ink-muted)]">Done</p>
              </div>
              <div
                className={`rounded-lg border p-2.5 ${o.overdueCount > 0 ? 'border-overdue/60 bg-overdue-soft' : 'border-[var(--color-line)]'}`}
              >
                <p className={`text-[17px] font-semibold leading-none ${o.overdueCount > 0 ? 'text-overdue' : ''}`}>
                  {o.overdueCount}
                </p>
                <p className="mt-1 text-[var(--color-ink-muted)]">Overdue</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <ExtendStayCard occupant={o} onChanged={onChanged} />
            <DischargeWorkflowCard occupant={o} onChanged={onChanged} />

            {milestoneSteps.length > 0 ? (
              <Panel
                title="Treatment programme"
                subtitle={`${milestones.filter((t) => t.isComplete).length} of ${milestones.length} milestones complete`}
              >
                <Timeline steps={milestoneSteps} />
              </Panel>
            ) : null}
          </div>

          <Panel title="Required actions" subtitle={`${o.completedCount} of ${o.totalCount} complete`}>
            <p className="mb-3 rounded-lg bg-primary-soft px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
              Each action carries a <strong className="font-semibold">due date</strong> separate from
              its completion. That is what makes lateness measurable &mdash; the whiteboard stores one
              value per action, so it cannot record &ldquo;due Monday, done Wednesday&rdquo;.
            </p>
            <ul className="flex flex-col gap-1.5">
              {sorted.map((t) => (
                <TaskRow key={t.id ?? t.code} task={t} admittedAt={o.admittedAt} onChanged={onChanged} />
              ))}
            </ul>
          </Panel>
        </div>

        <footer className="border-t border-[var(--color-line)] px-5 py-3 text-[11px] text-[var(--color-ink-muted)]">
          Detox, medical, safeguarding and therapy notes are not shown in this preview &mdash; they
          sit behind sensitivity level 3 and need the access model first.
        </footer>

        {/* Nested rather than a sibling so it stacks above this dialog and closing it returns here,
            instead of dismissing the whole client file. */}
        {o.photoUrl ? (
          <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
            <DialogContent className="w-auto max-w-[92vw] border-none bg-transparent p-0 shadow-none">
              <DialogTitle className="sr-only">{o.displayName} — photograph</DialogTitle>
              <img
                src={o.photoUrl}
                alt={`Photograph of ${o.displayName}`}
                className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Upload (or replace) this client's photograph — the missing piece behind the "no photograph" chip
 * shown everywhere else in the app. The bucket, its RLS policies and `client_photos` itself already
 * existed (migrations 0016/0017, tested); this component is the first thing that actually calls them.
 *
 * Hidden behind `photos.upload` rather than shown-but-disabled: the permission check happens at the
 * bucket and the table too, so a caller lacking it could never make this succeed anyway.
 */
function PhotoUpload({
  centreId,
  clientId,
  hasPhoto,
  onUploaded,
}: {
  centreId: string;
  clientId: string;
  hasPhoto: boolean;
  onUploaded?: (() => void) | undefined;
}) {
  const { can } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!can('photos.upload')) return null;

  const pick = () => inputRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { uploadedBytes, originalBytes } = await clientPhotos.upload({ centreId, clientId, file });
      // Resizing happens automatically; saying so keeps it from looking like the wrong file was kept.
      setNote(
        uploadedBytes < originalBytes
          ? `Resized ${formatBytes(originalBytes)} → ${formatBytes(uploadedBytes)}`
          : null,
      );
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={pick}
        className="rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
      >
        {busy ? 'Uploading…' : hasPhoto ? 'Replace photo' : 'Upload photo'}
      </button>
      {error ? <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span> : null}
      {note ? (
        <span className="nums text-[10px] whitespace-nowrap text-[var(--color-ink-muted)]">{note}</span>
      ) : null}
    </div>
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
 *
 * "Due day N" (rather than an absolute date) matches the source layout — computed from the real
 * admission date and the task's real due date, not a separate stored field.
 */
function TaskRow({
  task: t,
  admittedAt,
  onChanged,
}: {
  task: BoardTask;
  admittedAt: Date;
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
  const dayNumber = t.dueAt ? calendarDaysBetween(admittedAt, t.dueAt, TZ) + 1 : null;
  // Whole calendar days, the same way treatment days are counted everywhere else in this codebase.
  const daysOverdue = t.isOverdue && t.dueAt ? calendarDaysBetween(t.dueAt, new Date(), TZ) : 0;
  const wasReopened = t.reopens.length > 0;

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
    <li
      className={`rounded-lg border px-2.5 py-2 ${
        t.isOverdue
          ? 'border-overdue/40 border-l-4 border-l-overdue bg-overdue-soft'
          : wasReopened
            ? 'border-amber-500/40 border-l-4 border-l-amber-500 bg-amber-500/[0.06]'
            : 'border-[var(--color-line)]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[12.5px] leading-tight ${t.isComplete ? 'text-[var(--color-ink-muted)] line-through' : 'font-medium'}`}
          >
            {t.title}
          </span>
          <span className="nums block text-[10px] text-[var(--color-ink-muted)]">
            {dayNumber !== null ? `Due day ${dayNumber}` : 'No due date'} &middot;{' '}
            {CATEGORY_LABEL[t.category] ?? t.category}
          </span>
          {t.isComplete ? (
            <span className="nums mt-0.5 block text-[10px] text-[var(--color-ink-muted)]">
              {t.completedAt ? `Completed ${formatDate(t.completedAt)}` : 'Completed · date not recorded'}
              {t.completedBy ? ` by ${t.completedBy}` : ''}
            </span>
          ) : null}
          {wasReopened ? (
            <button
              type="button"
              onClick={() => setShowReopens((v) => !v)}
              aria-expanded={showReopens}
              className="nums mt-0.5 block text-left text-[10px] font-medium text-amber-700 underline underline-offset-2 dark:text-amber-400"
            >
              {t.reopens.length === 1 ? 'Reopened once' : `Reopened ${t.reopens.length} times`} &middot;{' '}
              {formatDate(t.reopens[0]!.at)}
              {t.reopens[0]!.by ? ` by ${t.reopens[0]!.by}` : ''}
              {showReopens ? ' ▴' : ' ▾'}
            </button>
          ) : null}
        </span>
        {t.isComplete ? (
          <StatusBadge status="complete" label="Done" size="sm" />
        ) : t.isNotApplicable ? (
          <span title={t.notApplicableReason ?? undefined}>
            <StatusBadge status="neutral" label="Not applicable" size="sm" />
          </span>
        ) : t.isOverdue ? (
          <StatusBadge
            status="overdue"
            label={daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`}
            size="sm"
          />
        ) : t.isDueToday ? (
          <StatusBadge status="attention" label="Today" size="sm" />
        ) : (
          <StatusBadge status="ontrack" label="On track" size="sm" />
        )}

        {canComplete && mode === 'idle' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => (t.requiresCompletionNote ? setMode('note') : complete())}
            className="shrink-0 rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            {busy ? '…' : 'Complete'}
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

      {showReopens ? (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-[var(--color-line)] pt-2">
          {t.reopens.map((r, i) => (
            <li key={i} className="rounded-md bg-amber-500/[0.08] px-2 py-1.5">
              <p className="nums text-[10px] text-[var(--color-ink-muted)]">
                {formatDateWithDay(r.at)}
                {r.by ? ` · ${r.by}` : ''}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-snug">
                {r.reason ?? <span className="text-[var(--color-ink-muted)]">No reason recorded.</span>}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

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
              {busy ? 'Saving…' : mode === 'note' ? 'Complete' : 'Reopen'}
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



function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-[var(--color-ink-muted)]">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
