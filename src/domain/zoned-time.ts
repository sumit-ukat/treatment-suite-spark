/**
 * Timezone-aware instant arithmetic.
 *
 * Every deadline in this system is an instant (stored as `timestamptz`) but is *meant* by staff as
 * a wall-clock time at a centre. Those two things diverge twice a year.
 *
 * A 28-day admission — the standard stay at Primrose Lodge — crosses the BST/GMT boundary roughly
 * one time in six. If "+28 days" is implemented as `+28 * 86_400_000` milliseconds, a client
 * admitted at 14:00 on 20 October has a discharge deadline of 13:00 on 17 November. An hour is
 * usually harmless; a *date* that lands on the wrong side of midnight is not, because "due today"
 * drives the dashboard.
 *
 * So: calendar units (days, weeks) are added to the **wall clock** in the centre's zone and then
 * converted back to an instant. Clock units (hours) are added to the **instant** directly, because
 * "within 24 hours" means 24 elapsed hours regardless of what the clocks did.
 *
 * No dependencies — this uses the Intl timezone database that ships with Node.
 */

export type CalendarUnit = 'days' | 'weeks';
export type ClockUnit = 'hours';
export type OffsetUnit = CalendarUnit | ClockUnit;

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Read an instant as wall-clock time in the given zone. */
export function toWallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing '${type}' from Intl output for zone ${timeZone}`);
    return Number(part.value);
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Some ICU builds render midnight as "24" under hour12:false.
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** The zone's UTC offset, in milliseconds, at a given instant. */
function offsetAt(instant: Date, timeZone: string): number {
  const wc = toWallClock(instant, timeZone);
  const asIfUtc = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second);
  // Discard sub-second noise so the comparison is exact.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convert a wall-clock reading in a zone back to an instant.
 *
 * Two-pass offset resolution: guess using the offset at the naive instant, then re-resolve using
 * the offset actually in force at that result. This is correct everywhere except the two hours a
 * year that are ambiguous or non-existent:
 *
 *  - **Non-existent** (01:30 on the spring-forward Sunday): resolves to the equivalent instant
 *    after the jump.
 *  - **Ambiguous** (01:30 on the autumn fall-back Sunday, which happens twice): resolves to the
 *    *first* occurrence, i.e. still in summer time.
 *
 * Both are deterministic and documented rather than left to chance. Neither is a plausible source
 * of a real deadline, but a system that quietly picks a different answer each run is worse than one
 * that picks a stated answer.
 */
export function fromWallClock(wc: WallClock, timeZone: string): Date {
  const naive = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second);
  const firstGuess = new Date(naive - offsetAt(new Date(naive), timeZone));
  const refined = new Date(naive - offsetAt(firstGuess, timeZone));

  // If refining moved us to an offset that no longer reproduces the requested wall clock, the time
  // is non-existent (spring forward). Fall back to the first guess, which lands after the jump.
  const check = toWallClock(refined, timeZone);
  const reproduced =
    check.year === wc.year &&
    check.month === wc.month &&
    check.day === wc.day &&
    check.hour === wc.hour &&
    check.minute === wc.minute;
  return reproduced ? refined : firstGuess;
}

/**
 * Add whole calendar days/weeks, preserving the wall-clock time of day in the centre's zone.
 *
 * `addCalendar(20 Oct 14:00 BST, 28, 'days')` → 17 Nov **14:00 GMT**, not 13:00.
 */
export function addCalendar(
  instant: Date,
  amount: number,
  unit: CalendarUnit,
  timeZone: string,
): Date {
  const days = unit === 'weeks' ? amount * 7 : amount;
  const wc = toWallClock(instant, timeZone);
  // Normalise through UTC so month/year rollover is handled by the Date implementation.
  const shifted = new Date(Date.UTC(wc.year, wc.month - 1, wc.day + days, wc.hour, wc.minute, wc.second));
  return fromWallClock(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
    },
    timeZone,
  );
}

/** Add elapsed clock hours. Unaffected by DST — 24 hours is 24 hours. */
export function addHours(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * MS_PER_HOUR);
}

/** Add an offset in whatever unit a task template specifies. */
export function addOffset(
  instant: Date,
  amount: number,
  unit: OffsetUnit,
  timeZone: string,
): Date {
  return unit === 'hours' ? addHours(instant, amount) : addCalendar(instant, amount, unit, timeZone);
}

/** The calendar date in the centre's zone, as `YYYY-MM-DD`. */
export function toZonedDateString(instant: Date, timeZone: string): string {
  const { year, month, day } = toWallClock(instant, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parse a `YYYY-MM-DD` date at a given local time of day in the centre's zone. */
export function fromZonedDateString(
  date: string,
  timeZone: string,
  timeOfDay: { hour: number; minute: number } = { hour: 0, minute: 0 },
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Expected YYYY-MM-DD, received '${date}'`);
  const [, y, m, d] = match as unknown as [string, string, string, string];
  return fromWallClock(
    {
      year: Number(y),
      month: Number(m),
      day: Number(d),
      hour: timeOfDay.hour,
      minute: timeOfDay.minute,
      second: 0,
    },
    timeZone,
  );
}

/**
 * Whole calendar days between two instants, measured in the centre's zone.
 *
 * Counts *date boundaries crossed*, not elapsed milliseconds, so 23:00 Monday → 01:00 Tuesday is
 * 1 day. This is how staff count treatment days.
 */
export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  const a = toWallClock(from, timeZone);
  const b = toWallClock(to, timeZone);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / (24 * MS_PER_HOUR));
}

/** True when both instants fall on the same calendar date in the centre's zone. */
export function isSameZonedDate(a: Date, b: Date, timeZone: string): boolean {
  return toZonedDateString(a, timeZone) === toZonedDateString(b, timeZone);
}

/** Minutes of UTC offset in force at an instant — exposed for diagnostics and tests. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  return offsetAt(instant, timeZone) / MS_PER_MINUTE;
}
