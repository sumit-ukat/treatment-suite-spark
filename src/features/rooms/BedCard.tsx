import type { BoardBed, Occupant } from './board-data.js';
import { formatDate } from '../../lib/format.js';
import { Chip } from '../../components/ui.tsx';
import { StatusBadge } from '../../components/status-badge.tsx';

/**
 * Photograph, when a real one has been uploaded — initials otherwise.
 *
 * `photoUrl` is a signed URL into the private `client-photos` bucket (migration 0016), refreshed on
 * every board load rather than stored — the bucket has no public access, so a bare storage path is
 * never displayable on its own. The fictional and frozen-snapshot boards in board-data.ts never set
 * this even when `photoState` is 'present' (no real image was ever imported for them), which falls
 * back to the same initials-only rendering this always used.
 *
 * Two states, not three. Verification was removed (Q43, answered): photographs are taken at
 * admission and that is the whole process, so "awaiting verification" would be a status nobody ever
 * clears — and an indicator that never resolves teaches people to ignore indicators. The only
 * question left is whether a photograph exists, and a missing one still matters, because
 * identification at handover is what the photo is for.
 *
 * State is shown as a badge AND a screen-reader label, so it never depends on colour alone.
 */
export function PhotoBadge({
  occupant,
  size = 'md',
}: {
  occupant: Occupant;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}) {
  const missing = occupant.photoState === 'missing';
  const ring = missing ? 'ring-red-500/60' : 'ring-emerald-500/55';
  const mark = missing ? '?' : '✓';
  const markTone = missing ? 'bg-red-600' : 'bg-emerald-600';
  const title = missing ? 'No photograph on file' : 'Photograph on file';
  const box =
    size === '2xl'
      ? 'size-40 text-[44px]'
      : size === 'xl'
        ? 'size-32 text-[34px]'
        : size === 'lg'
          ? 'size-12 text-[15px]'
          : size === 'sm'
            ? 'size-7 text-[10px]'
            : 'size-10 text-[13px]';
  const dot =
    size === 'sm' ? 'size-[11px] text-[7px]' : size === '2xl' ? 'size-[30px] text-[14px]' : size === 'xl' ? 'size-[26px] text-[13px]' : 'size-[15px] text-[9px]';

  return (
    <div className="relative shrink-0" title={title}>
      {occupant.photoUrl ? (
        <img
          src={occupant.photoUrl}
          alt=""
          className={`${box} rounded-full object-cover ring-2 ${ring}`}
        />
      ) : (
        <div
          className={`grid ${box} place-items-center rounded-full bg-black/[0.07] font-semibold text-[var(--color-ink)] ring-2 dark:bg-white/12 ${ring}`}
          aria-hidden="true"
        >
          {occupant.initials}
        </div>
      )}
      <span
        className={`absolute -right-0.5 -bottom-0.5 grid ${dot} place-items-center rounded-full font-bold text-white ring-2 ring-[var(--color-panel)] ${markTone}`}
        aria-hidden="true"
      >
        {mark}
      </span>
      <span className="sr-only">{title}</span>
    </div>
  );
}

export function BedLabel({
  label,
  shared,
  variant = 'occupied',
}: {
  label: string;
  shared: boolean;
  variant?: 'occupied' | 'available';
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`nums rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
          variant === 'available'
            ? 'bg-[color:color-mix(in_oklab,var(--brand-blue)_28%,transparent)] text-[var(--brand-blue-ink)]'
            : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
        }`}
      >
        {label}
      </span>
      {shared ? (
        <span
          className="text-[10px] text-[var(--color-ink-muted)]"
          title="One of two beds in a shared room"
        >
          shared
        </span>
      ) : null}
    </span>
  );
}

/**
 * One prioritised line, not several. A card used to stack a top-border stripe, a colour wash behind
 * it, a floating corner badge, a status dot, red/amber text in three separate stat fields, a
 * bottom-row summary AND a GP-specific banner — six-odd signals for what is fundamentally one fact
 * ("this client needs attention, and here is the single most important reason why"). Collapsing that
 * into one line here is what the rest of this component now renders instead of choosing per-field.
 */
function statusLine(o: Occupant, dischargePassed: boolean, dischargeToday: boolean): { tone: 'alert' | 'warn' | 'good'; label: string } {
  const gpTask = o.tasks.find((t) => t.code === 'gp_summary');
  const gpOverdue = !!gpTask && gpTask.isOverdue && !gpTask.isComplete && !gpTask.isNotApplicable;

  if (dischargePassed) return { tone: 'alert', label: `Discharge passed · ${o.treatmentDay - o.durationDays}d over` };
  if (gpOverdue) return { tone: 'alert', label: 'GP summary overdue' };
  if (o.overdueCount > 0) return { tone: 'alert', label: `${o.overdueCount} overdue` };
  if (dischargeToday) return { tone: 'warn', label: 'Discharging today' };
  if (o.dueTodayCount > 0) return { tone: 'warn', label: `${o.dueTodayCount} due today` };
  return { tone: 'good', label: 'On track' };
}

const STATUS_TONE_CLS: Record<'alert' | 'warn' | 'good', string> = {
  alert: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  good: 'text-emerald-600 dark:text-emerald-400',
};

export function OccupiedCard({ bed, onOpen }: { bed: BoardBed; onOpen: () => void }) {
  const o = bed.occupant;
  if (!o) return null;

  const progress = Math.round((o.completedCount / o.totalCount) * 100);
  const dischargePassed = o.daysUntilDischarge < 0;
  const dischargeToday = o.daysUntilDischarge === 0;

  const status = statusLine(o, dischargePassed, dischargeToday);
  // Just the counts already folded into the status line above, added up — a corner badge for "how
  // many things", not a second judgement about what matters. Restricted alerts stay out of it: that
  // flag is deliberately kept separate and undiluted, carried by the border stripe + icon instead.
  const attentionCount = o.overdueCount + o.dueTodayCount + (dischargePassed ? 1 : 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex w-full flex-col gap-4 rounded-2xl border bg-card p-5 text-left shadow-soft transition duration-150 hover:-translate-y-px hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
        o.hasRestrictedAlert
          ? 'border-t-[3px] border-t-red-400 hover:border-[var(--color-accent)]/55 hover:border-t-red-400 dark:border-t-red-500 dark:hover:border-t-red-500'
          : o.hasOpenConcern
          ? 'border-t-[3px] border-t-amber-400 hover:border-[var(--color-accent)]/55 hover:border-t-amber-400 dark:border-t-amber-500 dark:hover:border-t-amber-500'
          : o.isExtendedStay
          ? 'border-t-[3px] border-t-teal-400 hover:border-[var(--color-accent)]/55 hover:border-t-teal-400 dark:border-t-teal-500 dark:hover:border-t-teal-500'
          : 'hover:border-[var(--color-accent)]/55'
      }`}
    >
      <div className="flex items-start gap-3">
        <PhotoBadge occupant={o} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <BedLabel label={bed.label} shared={bed.shared} />
            {o.hasRestrictedAlert ? (
              <span
                className="ml-auto shrink-0 text-[13px] text-red-600 dark:text-red-400"
                title="Restricted alert &mdash; contact centre manager"
              >
                <span aria-hidden="true">&#9873;</span>
                <span className="sr-only">Restricted alert &mdash; contact centre manager</span>
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 truncate text-sm leading-tight font-semibold">
            {o.displayName}
          </div>
          <div className="nums mt-0.5 text-[11.5px] text-[var(--color-ink-muted)]">{o.reference}</div>
        </div>
        {/* One count, in the header row rather than floating over the corner — same information the
            old absolute-positioned badge gave, without a fourth overlapping visual layer. */}
        {attentionCount > 0 ? (
          <span
            title={`${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention`}
            className="nums shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[10.5px] leading-none font-bold text-white"
          >
            {attentionCount}
          </span>
        ) : null}
      </div>

      {/* Facts, plain — the status line below is where colour and judgement live, once. */}
      <dl className="nums grid grid-cols-3 gap-x-3 text-xs">
        <div>
          <dt className="text-[11px] text-[var(--color-ink-muted)]">Day</dt>
          <dd className="font-medium">
            {o.treatmentDay}
            <span className="text-[var(--color-ink-muted)]"> of {o.durationDays}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-ink-muted)]">Discharge</dt>
          <dd className="font-medium">{formatDate(o.plannedDischargeDate)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-[var(--color-ink-muted)]">Therapist</dt>
          <dd className="truncate font-medium">
            {o.therapist ?? (
              <span className="text-amber-600 dark:text-amber-400">None</span>
            )}
          </dd>
        </div>
      </dl>

      <div
        className="h-1 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progress}% of required actions completed`}
      >
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* The one status line — priority-ordered in statusLine() above, so it never disagrees with
          the border stripe or the corner count. */}
      <div className="flex items-center gap-2 text-[11.5px]">
        <span className={`font-medium ${STATUS_TONE_CLS[status.tone]}`}>{status.label}</span>
        {o.isExtendedStay ? (
          <span className="ml-auto text-[11px] font-medium text-teal-600 dark:text-teal-400">
            +{o.extensionDays ?? '?'}d ext.
          </span>
        ) : null}
      </div>
    </button>
  );
}

/**
 * An available bed.
 *
 * This is where the brand blue does its work. Availability is not a status in the alert sense — it
 * needs no attention — so a calm blue wash reads as "ready" without competing with the amber and red
 * that mean "act now". Blue also fails text-contrast thresholds, which is exactly why it appears
 * here as a fill and a border rather than as words.
 */
export function AvailableCard({ bed, onOpen }: { bed: BoardBed; onOpen?: () => void }) {
  // `bg-[color:…]` — without the explicit `color:` type hint Tailwind reads a color-mix() value as a
  // background-image, and the fill silently never appears.
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="flex min-h-[220px] flex-col rounded-2xl border border-dashed border-[color-mix(in_oklab,var(--brand-blue)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--brand-blue)_9%,transparent)] p-5 text-left transition hover:bg-[color:color-mix(in_oklab,var(--brand-blue)_16%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-default"
    >
      <BedLabel label={bed.label} shared={bed.shared} variant="available" />
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <span aria-hidden="true" className="text-[15px] text-[var(--brand-blue-ink)] opacity-70">
          &#9675;
        </span>
        <span className="text-[12.5px] font-medium text-[var(--brand-blue-ink)]">Available</span>
        <span className="text-[10.5px] text-[var(--color-ink-muted)] opacity-80">
          {bed.shared ? 'Shared room bed' : 'Single room'}
        </span>
      </div>
    </button>
  );
}
