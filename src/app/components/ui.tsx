/** Shared primitives. Status is always icon + text, never colour alone. */

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

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  active = false,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
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

  const inner = (
    <>
      <div className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
        {label}
      </div>
      <div className={`nums mt-1.5 text-[26px] leading-none font-semibold ${valueTone}`}>{value}</div>
      <div className="mt-1 h-3.5 text-[11px] text-[var(--color-ink-muted)]">{hint ?? ''}</div>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={shell} aria-pressed={active}>
      {inner}
    </button>
  ) : (
    <div className={shell}>{inner}</div>
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
