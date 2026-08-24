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
 * Overall status, in one colour rather than four separate numbers — for scanning a grid of a dozen
 * cards at once, before dropping into any one card's own detail. Same priority order the bottom-row
 * chips already use, so the dot never disagrees with the chips beneath it.
 */
const STATUS_DOT_TONE: Record<'alert' | 'warn' | 'good', string> = {
  alert: 'bg-red-500 dark:bg-red-400',
  warn: 'bg-amber-500 dark:bg-amber-400',
  good: 'bg-emerald-500 dark:bg-emerald-400',
};

export function OccupiedCard({ bed, onOpen }: { bed: BoardBed; onOpen: () => void }) {
  const o = bed.occupant;
  if (!o) return null;

  const progress = Math.round((o.completedCount / o.totalCount) * 100);
  const dischargePassed = o.daysUntilDischarge < 0;
  const dischargeToday = o.daysUntilDischarge === 0;
  const dischargeSoon = o.daysUntilDischarge > 0 && o.daysUntilDischarge <= 3;
  const daysOverrun = o.treatmentDay - o.durationDays;

  const dischargeTone = dischargePassed
    ? 'text-red-600 dark:text-red-400'
    : dischargeToday || dischargeSoon
      ? 'text-amber-600 dark:text-amber-400'
      : '';

  const overdueOrPastDue = dischargePassed || o.overdueCount > 0;
  const dueSoon = !overdueOrPastDue && (dischargeToday || o.dueTodayCount > 0);
  const statusTone: 'alert' | 'warn' | 'good' = overdueOrPastDue ? 'alert' : dueSoon ? 'warn' : 'good';
  const statusLabel = overdueOrPastDue ? 'Needs attention' : dueSoon ? 'Due soon' : 'On track';
  // Just the counts already shown as chips below, added up — a corner badge for "how many things",
  // not a new judgement about what matters. Restricted alerts stay out of it: that flag is deliberately
  // kept separate and undiluted, not folded into a generic number.
  const attentionCount = o.overdueCount + o.dueTodayCount + (dischargePassed ? 1 : 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex w-full flex-col gap-5 rounded-2xl border bg-card p-5 text-left shadow-soft transition duration-150 hover:-translate-y-px hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
        o.hasRestrictedAlert
          ? 'border-t-[3px] border-t-red-400 hover:border-[var(--color-accent)]/55 hover:border-t-red-400 dark:border-t-red-500 dark:hover:border-t-red-500'
          : o.hasOpenConcern
          ? 'border-t-[3px] border-t-amber-400 hover:border-[var(--color-accent)]/55 hover:border-t-amber-400 dark:border-t-amber-500 dark:hover:border-t-amber-500'
          : o.isExtendedStay
          ? 'border-t-[3px] border-t-teal-400 hover:border-[var(--color-accent)]/55 hover:border-t-teal-400 dark:border-t-teal-500 dark:hover:border-t-teal-500'
          : 'hover:border-[var(--color-accent)]/55'
      }`}
    >
      {o.hasRestrictedAlert ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-14 rounded-t-2xl bg-gradient-to-b from-red-50/80 to-transparent dark:from-red-950/30"
        />
      ) : o.hasOpenConcern ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-14 rounded-t-2xl bg-gradient-to-b from-amber-50/70 to-transparent dark:from-amber-950/25"
        />
      ) : o.isExtendedStay ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-14 rounded-t-2xl bg-gradient-to-b from-teal-50/70 to-transparent dark:from-teal-950/25"
        />
      ) : null}
      {attentionCount > 0 ? (
        <span
          aria-hidden="true"
          title={`${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention`}
          className="absolute -top-1.5 -right-1.5 grid min-w-[18px] place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-[18px] font-bold text-white ring-2 ring-[var(--color-panel)]"
        >
          {attentionCount}
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        <PhotoBadge occupant={o} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <BedLabel label={bed.label} shared={bed.shared} />
            <span
              aria-hidden="true"
              title={statusLabel}
              className={`size-2 shrink-0 rounded-full ${STATUS_DOT_TONE[statusTone]}`}
            />
            <span className="sr-only">{statusLabel}</span>
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
      </div>

      <dl className="nums grid grid-cols-3 gap-x-3 text-xs">
        <div>
          <dt className="text-[11px] text-[var(--color-ink-muted)]">Day</dt>
          <dd className="font-medium">
            {dischargePassed ? (
              <span className="text-red-600 dark:text-red-400">
                {o.treatmentDay} &middot; {daysOverrun}d over
              </span>
            ) : (
              <>
                {o.treatmentDay}
                <span className="text-[var(--color-ink-muted)]"> of {o.durationDays}</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--color-ink-muted)]">Discharge</dt>
          <dd className={`font-medium ${dischargeTone}`}>{formatDate(o.plannedDischargeDate)}</dd>
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

      <div className="flex items-center gap-2 text-[11.5px]">
        {dischargePassed ? (
          <span className="font-medium text-red-600 dark:text-red-400">Discharge passed</span>
        ) : dischargeToday ? (
          <span className="font-medium text-amber-600 dark:text-amber-400">Discharging today</span>
        ) : null}
        {o.overdueCount > 0 ? (
          <span className="font-medium text-red-600 dark:text-red-400">
            {dischargePassed ? '·' : ''} {o.overdueCount} overdue
          </span>
        ) : o.dueTodayCount > 0 ? (
          <span className="font-medium text-amber-600 dark:text-amber-400">{o.dueTodayCount} due today</span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400">On track</span>
        )}
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
