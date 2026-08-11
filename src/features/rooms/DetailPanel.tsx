import { useRef, useState } from 'react';
import type { BoardBed, BoardTask, DischargeRequestSummary, Occupant } from './board-data.js';
import { formatDate, formatDateWithDay } from '../../lib/format.js';
import { formatBytes } from '../../lib/image.js';
import { PhotoBadge } from './BedCard.tsx';
import { Chip, Panel, Timeline } from '../../components/ui.tsx';
import { StatusBadge, type StatusKey } from '../../components/status-badge.tsx';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { clientPhotos, discharge as dischargeService, tasks as taskService } from '../../services/data-access.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { calendarDaysBetween, fromZonedDateString } from '../../domain/zoned-time.js';
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
      <DialogContent className="flex max-h-[88vh] w-full max-w-[1080px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Client file — {o.displayName}</DialogTitle>

        {/* Identity + facts + programme progress */}
        <div className="border-b border-[var(--color-line)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-3.5">
              <div className="flex flex-col items-center gap-1.5">
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
                {o.clientId ? (
                  <PhotoUpload
                    centreId={centreId}
                    clientId={o.clientId}
                    hasPhoto={o.photoState === 'present'}
                    onUploaded={onChanged}
                  />
                ) : null}
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-display text-[19px] font-semibold">{o.displayName}</h2>
                  <StatusBadge status={overallStatus} />
                  {o.hasRestrictedAlert ? <Chip icon="&#9873;" label="Restricted alert" tone="alert" /> : null}
                </div>
                <div className="nums mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
                  {o.reference} &middot; Bed {bed.label} &middot; Group {o.group || '—'}
                </div>
              </div>
            </div>

            <div className="w-full max-w-[220px] rounded-xl border border-[var(--color-line)] p-3.5 sm:w-auto">
              <p className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                Programme progress
              </p>
              <p className="nums mt-1.5 text-[22px] font-semibold leading-none">
                Day {o.treatmentDay}
                <span className="text-[14px] text-[var(--color-ink-muted)]">/{o.durationDays}</span>
              </p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="brand-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="nums mt-1 text-[10.5px] text-[var(--color-ink-muted)]">
                {pct}% of the planned stay elapsed
              </p>
              <div className="nums mt-3 grid grid-cols-2 gap-2 text-center text-[11px]">
                <div className="rounded-lg border border-[var(--color-line)] p-2">
                  <p className="text-[15px] font-semibold">{o.completedCount}</p>
                  <p className="text-[var(--color-ink-muted)]">Done</p>
                </div>
                <div
                  className={`rounded-lg border p-2 ${o.overdueCount > 0 ? 'border-overdue/60 bg-overdue-soft' : 'border-[var(--color-line)]'}`}
                >
                  <p className={`text-[15px] font-semibold ${o.overdueCount > 0 ? 'text-overdue' : ''}`}>
                    {o.overdueCount}
                  </p>
                  <p className="text-[var(--color-ink-muted)]">Overdue</p>
                </div>
              </div>
            </div>
          </div>

          <div className="nums mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] sm:grid-cols-3">
            <Fact label="Admitted" value={formatDate(o.admittedAt)} />
            <Fact label="Planned discharge" value={formatDate(o.plannedDischargeDate)} />
            <Fact label="Primary concern" value={o.substance || '—'} />
            <Fact label="Programme" value={`${o.durationDays} days`} />
            <Fact
              label="Family meeting"
              value={o.familyMeetingEligibleNow ? 'Eligible now' : `From ${formatDate(o.familyMeetingEligibleFrom)}`}
            />
            <Fact label="Focal therapist" value={o.therapist ?? 'Not assigned'} />
            <Fact label="Keyworker" value={o.keyworker ?? 'Not assigned'} />
            <Fact label="Buddy" value={o.buddy} />
          </div>
        </div>

        {/* Two-column body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
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

type StepStatus = 'complete' | 'ready' | 'waiting';

/** One numbered step in the discharge workflow card — the source layout's own visual language
 * (numbered circle, connecting line, "Ready to action" highlight) applied to the real three states
 * `discharge_requests` can actually be in (migration 0027), not a fixed decorative sequence. */
function DischargeStep({
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
  children?: React.ReactNode;
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
 * The discharge workflow — see migration 0027 for the reasoning behind the two paths this mirrors:
 *
 * - `discharge_type: 'planned'` is routine and needs only `discharge.finalise`, so the form submits
 *   straight to `finalise` and never creates a request row — there is no intermediate state for a
 *   planned discharge to sit in, so it never occupies step 2 or 3 below.
 * - Anything else needs a different person to approve it first, so the same form instead calls
 *   `request`, and the resulting pending/approved state renders here until someone with
 *   `discharge.approve` — never the requester themselves, enforced server-side — decides it, and then
 *   someone with `discharge.finalise` closes it out.
 *
 * `occupant.admissionId === null` (the fictional and frozen boards) renders nothing: there is no real
 * admission to discharge.
 */
function DischargeWorkflowCard({
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

          {req ? (
            <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
              {DISCHARGE_TYPE_LABEL[req.dischargeType]} &mdash; {req.reason}
            </p>
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
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </Panel>
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
