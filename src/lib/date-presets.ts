/**
 * The quick date-range filter bar shared by Client Directory, GP Summary, and Discharge — one
 * implementation so the three pages can't quietly drift into different "this quarter" math.
 */

export type DatePreset =
  | 'all'
  | 'today'
  | 'this_month'
  | 'this_year'
  | 'last_year'
  | 'this_quarter'
  | 'last_quarter'
  | 'last_6_months'
  | 'month';

export const DATE_PRESETS: { id: Exclude<DatePreset, 'month'>; label: string }[] = [
  { id: 'this_month', label: 'This Month' },
  { id: 'all', label: 'All Time' },
  { id: 'this_year', label: 'This Year' },
  { id: 'last_year', label: `Last Year (${new Date().getFullYear() - 1})` },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'last_quarter', label: 'Last Quarter' },
  { id: 'last_6_months', label: 'Last 6 Months' },
];

/** Inclusive `YYYY-MM-DD` bounds for a preset, computed against today — `null` means no bound (All
 * Time, or Month before a value has been picked). Compared directly against a date field's own
 * `YYYY-MM-DD` prefix at each call site, rather than full Date arithmetic there. */
export function presetRange(preset: DatePreset, monthValue: string): { start: string; end: string } | null {
  const now = new Date();
  const y = now.getFullYear();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const startOfMonth = (year: number, month: number) => new Date(year, month, 1);
  const endOfMonth = (year: number, month: number) => new Date(year, month + 1, 0);

  switch (preset) {
    case 'all':
      return null;
    case 'today': {
      const t = iso(now);
      return { start: t, end: t };
    }
    case 'this_month':
      return { start: iso(startOfMonth(y, now.getMonth())), end: iso(endOfMonth(y, now.getMonth())) };
    case 'this_year':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    case 'last_year':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return { start: iso(startOfMonth(y, q * 3)), end: iso(endOfMonth(y, q * 3 + 2)) };
    }
    case 'last_quarter': {
      const thisQ = Math.floor(now.getMonth() / 3);
      const q = thisQ === 0 ? 3 : thisQ - 1;
      const yy = thisQ === 0 ? y - 1 : y;
      return { start: iso(startOfMonth(yy, q * 3)), end: iso(endOfMonth(yy, q * 3 + 2)) };
    }
    case 'last_6_months': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      return { start: iso(start), end: iso(now) };
    }
    case 'month': {
      if (!monthValue) return null;
      const [yy, mm] = monthValue.split('-').map(Number) as [number, number];
      return { start: `${monthValue}-01`, end: iso(endOfMonth(yy, mm - 1)) };
    }
  }
}
