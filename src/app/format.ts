import { toZonedDateString } from '../domain/zoned-time.js';

const TZ = 'Europe/London';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a date for display: `3 Aug 26`.
 *
 * Always renders via the centre's timezone, and always includes the year — the source spreadsheet
 * used `dd/mm` and `d/m` for roughly 60 of its ~99 date cells, which leaves a reader unable to tell
 * which year a date belongs to. In a service where clients return for repeat episodes that is a
 * real ambiguity, not a cosmetic one.
 */
export function formatDate(value: Date | string): string {
  const iso = typeof value === 'string' ? value : toZonedDateString(value, TZ);
  const [y, m, d] = iso.split('-') as [string, string, string];
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? '?'} ${y.slice(2)}`;
}

/** Format a date with its weekday: `Mon 3 Aug 26`. */
export function formatDateWithDay(value: Date | string, timeZone = TZ): string {
  const iso = typeof value === 'string' ? value : toZonedDateString(value, timeZone);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
  return `${weekday} ${formatDate(iso)}`;
}
