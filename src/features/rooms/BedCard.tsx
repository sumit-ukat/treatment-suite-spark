import type { BoardBed, Occupant } from './board-data.js';
import { formatDate } from '../../lib/format.js';
import { Chip } from '../../components/ui.tsx';

/**
 * Photograph placeholder.
 *
 * Renders initials, never an image. Real client photographs are not used in any preview, fixture or
 * screenshot.
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
  size?: 'sm' | 'md' | 'lg';
}) {
  const missing = occupant.photoState === 'missing';
  const ring = missing ? 'ring-red-500/60' : 'ring-emerald-500/55';
  const mark = missing ? '?' : '✓';
  const markTone = missing ? 'bg-red-600' : 'bg-emerald-600';
  const title = missing ? 'No photograph on file' : 'Photograph on file';
  const box =
    size === 'lg' ? 'size-12 text-[15px]' : size === 'sm' ? 'size-7 text-[10px]' : 'size-10 text-[13px]';
  const dot = size === 'sm' ? 'size-[11px] text-[7px]' : 'size-[15px] text-[9px]';

  return (
    <div className="relative shrink-0" title={title}>
      <div
        className={`grid ${box} place-items-center rounded-full bg-black/[0.07] font-semibold text-[var(--color-ink)] ring-2 dark:bg-white/12 ${ring}`}
        aria-hidden="true"
      >
        {occupant.initials}
      </div>
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

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3.5 text-left transition duration-150 hover:-translate-y-px hover:border-[var(--color-accent)]/55 hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
          <div className="mt-1.5 truncate text-[13.5px] leading-tight font-semibold">
            {o.displayName}
          </div>
          <div className="nums text-[11px] text-[var(--color-ink-muted)]">{o.reference}</div>
        </div>
      </div>

      <dl className="nums grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        <div>
          <dt className="text-[10.5px] text-[var(--color-ink-muted)]">Day</dt>
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
          <dt className="text-[10.5px] text-[var(--color-ink-muted)]">Discharge</dt>
          <dd className={`font-medium ${dischargeTone}`}>{formatDate(o.plannedDischargeDate)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10.5px] text-[var(--color-ink-muted)]">Therapist</dt>
          <dd className="truncate font-medium">
            {o.therapist ?? (
              <span className="text-amber-600 dark:text-amber-400">Not assigned</span>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10.5px] text-[var(--color-ink-muted)]">Buddy</dt>
          <dd className="truncate font-medium">{o.buddy}</dd>
        </div>
      </dl>

      <div>
        <div
          className="h-[3px] overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Required actions completed"
        >
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="nums mt-1 flex items-center justify-between text-[10.5px] text-[var(--color-ink-muted)]">
          <span>
            {o.completedCount}/{o.totalCount} actions
          </span>
          <span>{progress}%</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {dischargePassed ? (
          <Chip icon="&#9650;" label="Discharge passed" tone="alert" />
        ) : null}
        {dischargeToday ? (
          <Chip icon="&#8594;" label="Discharging today" tone="warn" />
        ) : null}
        {o.overdueCount > 0 ? (
          <Chip icon="&#9650;" label={`${o.overdueCount} overdue`} tone="alert" />
        ) : null}
        {o.dueTodayCount > 0 ? (
          <Chip icon="&#9679;" label={`${o.dueTodayCount} due today`} tone="warn" />
        ) : null}
        {/* Recorded as X: the programme does not reach that week, so there is nothing to do. */}
        {o.notApplicableCount > 0 ? (
          <Chip
            icon="&#8212;"
            label={`${o.notApplicableCount} n/a`}
            title="Not applicable - the planned programme ends before these fall due."
          />
        ) : null}
        {!dischargePassed && !dischargeToday && o.overdueCount === 0 && o.dueTodayCount === 0 ? (
          <Chip icon="&#10003;" label="Nothing due" tone="good" />
        ) : null}
        {!o.familyMeetingEligibleNow ? (
          <Chip
            icon="&#9719;"
            label={`Family mtg ${formatDate(o.familyMeetingEligibleFrom)}`}
            title="Family meetings are not permitted until one week in treatment is complete"
          />
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
export function AvailableCard({ bed }: { bed: BoardBed }) {
  // `bg-[color:…]` — without the explicit `color:` type hint Tailwind reads a color-mix() value as a
  // background-image, and the fill silently never appears.
  return (
    <div className="flex min-h-[168px] flex-col rounded-xl border border-dashed border-[color-mix(in_oklab,var(--brand-blue)_55%,transparent)] bg-[color:color-mix(in_oklab,var(--brand-blue)_9%,transparent)] p-3.5 transition hover:bg-[color:color-mix(in_oklab,var(--brand-blue)_16%,transparent)]">
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
    </div>
  );
}
