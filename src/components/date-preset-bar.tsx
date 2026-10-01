import { CalendarDays } from 'lucide-react';
import { DATE_PRESETS, type DatePreset } from '../lib/date-presets.js';

/** The quick date-range filter bar shared by Client Directory, GP Summary, Discharge, and the
 * Executive Hub — see lib/date-presets.ts for the range math each preset resolves to. */
export function DatePresetBar({
  preset,
  monthValue,
  onPresetChange,
  onMonthChange,
  presets = DATE_PRESETS,
  clearTo = 'all',
}: {
  preset: DatePreset;
  monthValue: string;
  onPresetChange: (preset: Exclude<DatePreset, 'month'>) => void;
  onMonthChange: (month: string) => void;
  /** Defaults to the full 7-preset list; pass SHORT_DATE_PRESETS for a trimmed set. */
  presets?: { id: Exclude<DatePreset, 'month'>; label: string }[];
  /** What "Clear" resets to, and the preset that hides the Clear button because it's already the
   * resting state. Defaults to 'all'; pass the set's own default (e.g. 'this_month') when 'all'
   * isn't one of the presets offered. */
  clearTo?: Exclude<DatePreset, 'month'>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border bg-card p-2.5 shadow-soft">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPresetChange(p.id)}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
            preset === p.id
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
              : 'border-[var(--color-line)] text-[var(--color-ink)] hover:bg-black/5 dark:hover:bg-white/10'
          }`}
        >
          {p.label}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-[var(--color-line)]" aria-hidden />
      <span className="text-[11px] font-medium text-muted-foreground">Month</span>
      <label
        className={`relative flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
          preset === 'month'
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
            : 'border-[var(--color-line)] text-[var(--color-ink)] hover:bg-black/5 dark:hover:bg-white/10'
        }`}
      >
        <CalendarDays className="pointer-events-none mr-1.5 size-3.5" aria-hidden />
        <input
          type="month"
          value={monthValue}
          max={new Date().toISOString().slice(0, 7)}
          onChange={(e) => onMonthChange(e.target.value)}
          aria-label="Show only results in this month"
          className="w-[7.5rem] appearance-none bg-transparent outline-none [color-scheme:light] dark:[color-scheme:dark]"
        />
      </label>
      {preset !== clearTo ? (
        <button
          type="button"
          onClick={() => onPresetChange(clearTo)}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
