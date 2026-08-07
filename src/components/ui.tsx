/** Shared primitives. Status is always icon + text, never colour alone. */

import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'good' | 'warn' | 'alert' | 'accent';

/**
 * Status tones.
 *
 * `alert` uses red (hue ~0) rather than rose (hue ~350) to keep maximum hue distance from the brand
 * pink at 321. The brand pink is deliberately absent from this map: it cannot carry small text and
 * sits too close to alert red, so it never appears as a status anywhere in the app.
 */
const CHIP_TONES: Record<Tone, string> = {
  neutral: 'bg-black/[0.06] text-[var(--color-ink-muted)] dark:bg-white/10',
  good: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  alert: 'bg-red-500/13 text-red-700 dark:bg-red-400/15 dark:text-red-300',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
};

export function Chip({
  icon,
  label,
  tone = 'neutral',
  title,
}: {
  icon?: string;
  label: string;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap ${CHIP_TONES[tone]}`}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}

/**
 * The base unit content is grouped into: a titled white card, with an optional right-aligned link for
 * whatever "see more of this" already means on the page — never invented just to fill the corner.
 * `action` is a plain button, not a nested `<a>`/`<button>` pretending to be something bigger; the
 * card itself never intercepts clicks, so there is nothing for it to conflict with.
 */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 ${className}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13.5px] font-semibold">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 text-[12px] font-medium text-[var(--color-accent)] transition hover:underline"
          >
            {action.label} →
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Same mapping as `CHIP_TONES`, softened for a larger icon chip rather than inline text. */
const ICON_TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  good: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  alert: 'bg-red-500/13 text-red-700 dark:bg-red-400/15 dark:text-red-300',
  accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
};

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  active = false,
  onClick,
  actionLabel,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** A single glyph, rendered in a tone-coloured chip — the same icon language used by `Chip`. */
  icon?: string;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  /**
   * Shown instead of `hint`, styled as the tile's own affordance rather than a second, separately
   * clickable link — the whole tile is already the click target, so a nested link would just be two
   * controls doing one job. Only rendered when `onClick` is also given: a tile with nothing to do on
   * click gets plain `hint` text, never a "View" label pointing nowhere.
   */
  actionLabel?: string;
}) {
  const valueTone =
    tone === 'alert'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[var(--color-ink)]';

  const shell = `rounded-xl border px-3.5 py-3 text-left transition ${
    active
      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
      : 'border-[var(--color-line)] bg-[var(--color-panel)]'
  } ${onClick ? 'hover:border-[var(--color-accent)]/60 cursor-pointer' : ''}`;

  const showAction = Boolean(onClick && actionLabel);

  const inner = (
    <div className="flex items-start gap-2.5">
      {icon ? (
        <span
          aria-hidden="true"
          className={`grid size-7 shrink-0 place-items-center rounded-lg text-[13px] ${ICON_TONES[tone]}`}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
          {label}
        </div>
        <div className={`nums mt-1.5 text-[26px] leading-none font-semibold ${valueTone}`}>{value}</div>
        <div
          className={`mt-1 h-3.5 text-[11px] ${
            showAction ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--color-ink-muted)]'
          }`}
        >
          {showAction ? `${actionLabel} →` : hint ?? ''}
        </div>
      </div>
    </div>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={shell} aria-pressed={active}>
      {inner}
    </button>
  ) : (
    <div className={shell}>{inner}</div>
  );
}

/** Same mapping again, as a solid fill/stroke for chart segments rather than a soft chip background. */
const CHART_TONES: Record<Tone, string> = {
  neutral: 'text-[var(--color-ink-muted)]',
  good: 'text-emerald-500 dark:text-emerald-400',
  warn: 'text-amber-500 dark:text-amber-400',
  alert: 'text-red-500 dark:text-red-400',
  accent: 'text-[var(--color-accent)]',
};

/**
 * A single horizontal track — occupancy-in-a-list, a completion rate next to other rows. Not a
 * standalone chart in its own right, but the piece every list-row chart in this app is made of.
 */
export function ProgressBar({
  percent,
  tone = 'accent',
  trackClassName = 'w-16',
}: {
  percent: number;
  tone?: Tone;
  /** Width/height utility classes for the track, so callers can fit it to their row. */
  trackClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-2">
      <div className={`h-1.5 shrink-0 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12 ${trackClassName}`}>
        <div className={`h-full rounded-full bg-current ${CHART_TONES[tone]}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="nums w-8 text-[11px] text-[var(--color-ink-muted)]">{percent}%</span>
    </div>
  );
}

/**
 * Several rates side by side — regions, centres, categories — read as a set rather than one at a
 * time. Values are treated as percentages (0–100); anything outside that range clamps rather than
 * overflowing the track.
 */
export function BarChart({
  data,
  tone = 'accent',
}: {
  data: ReadonlyArray<{ label: string; value: number }>;
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2.5">
          <div className="w-24 shrink-0 truncate text-[11.5px] text-[var(--color-ink-muted)]">{d.label}</div>
          <ProgressBar percent={d.value} tone={tone} trackClassName="flex-1" />
        </div>
      ))}
    </div>
  );
}

/**
 * One rate, given the weight of its own card rather than a row in a list — the "how full is it"
 * question a stat tile answers in digits, answered again at a glance. `value`/`label` are the same
 * two lines a `StatTile` shows; the ring is the addition, not a replacement.
 */
export function RingChart({
  percent,
  value,
  label,
  tone = 'accent',
  size = 84,
}: {
  percent: number;
  value: string;
  label: string;
  tone?: Tone;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const strokeWidth = Math.round(size * 0.11);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className="stroke-black/[0.08] dark:stroke-white/12"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`stroke-current transition-[stroke-dashoffset] ${CHART_TONES[tone]}`}
        />
      </svg>
      <div className="col-start-1 row-start-1 grid place-items-center text-center leading-tight">
        <div className="nums text-[16px] font-semibold text-[var(--color-ink)]">{value}</div>
        <div className="mt-0.5 max-w-[90%] truncate text-[9px] tracking-wide text-[var(--color-ink-muted)] uppercase">
          {label}
        </div>
      </div>
    </div>
  );
}

export function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
        active
          ? 'border-transparent bg-[var(--brand-purple)] text-white shadow-sm'
          : 'border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent-ring)] hover:text-[var(--color-ink)]'
      }`}
    >
      {label}
      {typeof count === 'number' ? (
        <span
          className={`nums rounded-full px-1.5 text-[10.5px] ${
            active ? 'bg-white/20' : 'bg-black/[0.07] dark:bg-white/12'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
