import { describe, expect, it } from 'vitest';
import {
  addCalendar,
  addHours,
  addOffset,
  calendarDaysBetween,
  daysLeftInWeek,
  fromZonedDateString,
  isSameZonedDate,
  toWallClock,
  toZonedDateString,
  zoneOffsetMinutes,
  zonedWeekday,
} from './zoned-time.js';

const LONDON = 'Europe/London';

describe('zone offsets', () => {
  it('reports BST in summer and GMT in winter', () => {
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), LONDON)).toBe(60);
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), LONDON)).toBe(0);
  });
});

describe('toWallClock', () => {
  it('renders an instant as local time in the centre zone', () => {
    expect(toWallClock(new Date('2026-07-15T13:30:00Z'), LONDON)).toEqual({
      year: 2026,
      month: 7,
      day: 15,
      hour: 14, // BST
      minute: 30,
      second: 0,
    });
  });

  it('renders local midnight as hour 0, not 24', () => {
    expect(toWallClock(new Date('2026-01-15T00:00:00Z'), LONDON).hour).toBe(0);
  });
});

describe('addCalendar across the BST -> GMT boundary', () => {
  // The clocks go back on Sunday 25 October 2026.
  it('preserves the local time of day over a 28-day admission', () => {
    const admittedAt = fromZonedDateString('2026-10-20', LONDON, { hour: 14, minute: 0 });
    expect(zoneOffsetMinutes(admittedAt, LONDON)).toBe(60); // admitted during BST

    const discharge = addCalendar(admittedAt, 28, 'days', LONDON);

    expect(zoneOffsetMinutes(discharge, LONDON)).toBe(0); // discharged during GMT
    const wc = toWallClock(discharge, LONDON);
    expect(wc).toMatchObject({ year: 2026, month: 11, day: 17, hour: 14, minute: 0 });
  });

  it('differs from naive millisecond arithmetic, which is the bug this prevents', () => {
    const admittedAt = fromZonedDateString('2026-10-20', LONDON, { hour: 14, minute: 0 });

    const correct = addCalendar(admittedAt, 28, 'days', LONDON);
    const naive = new Date(admittedAt.getTime() + 28 * 86_400_000);

    expect(naive.getTime()).not.toBe(correct.getTime());
    expect(toWallClock(naive, LONDON).hour).toBe(13); // an hour early
    expect(toWallClock(correct, LONDON).hour).toBe(14);
  });

  it('keeps a late-evening deadline on the intended calendar date', () => {
    // 23:30 local, four weeks before the clocks change: naive arithmetic would move the deadline
    // back to 22:30 -- same date here, but the same slip at 00:30 would move the *date*.
    const admittedAt = fromZonedDateString('2026-10-24', LONDON, { hour: 0, minute: 30 });
    const naive = new Date(admittedAt.getTime() + 7 * 86_400_000);
    const correct = addCalendar(admittedAt, 7, 'days', LONDON);

    expect(toZonedDateString(naive, LONDON)).toBe('2026-10-30'); // slipped a day
    expect(toZonedDateString(correct, LONDON)).toBe('2026-10-31'); // intended
  });
});

describe('addCalendar across the GMT -> BST boundary', () => {
  // The clocks go forward on Sunday 29 March 2026.
  it('preserves the local time of day', () => {
    const start = fromZonedDateString('2026-03-20', LONDON, { hour: 9, minute: 0 });
    const later = addCalendar(start, 14, 'days', LONDON);
    expect(toWallClock(later, LONDON)).toMatchObject({ month: 4, day: 3, hour: 9, minute: 0 });
    expect(zoneOffsetMinutes(later, LONDON)).toBe(60);
  });
});

describe('addHours', () => {
  it('adds elapsed time regardless of DST, so 24h stays 24h', () => {
    // Spanning the autumn fall-back (clocks go back 02:00 on Sun 25 Oct 2026): 24 *elapsed* hours
    // reads an hour earlier by the clock. That is correct for an elapsed-time rule -- and it is
    // exactly why calendar offsets must not be implemented this way.
    const before = fromZonedDateString('2026-10-24', LONDON, { hour: 14, minute: 0 });
    const after = addHours(before, 24);
    expect(after.getTime() - before.getTime()).toBe(24 * 3_600_000);
    expect(toWallClock(after, LONDON).hour).toBe(13);

    // The same span as a calendar day keeps the wall clock instead.
    expect(toWallClock(addCalendar(before, 1, 'days', LONDON), LONDON).hour).toBe(14);
  });

  it('is used for the 24-hour family contact rule, spanning the change', () => {
    const admittedAt = fromZonedDateString('2026-10-25', LONDON, { hour: 23, minute: 30 });
    const due = addHours(admittedAt, 24);
    expect(due.getTime() - admittedAt.getTime()).toBe(86_400_000);
  });
});

describe('addOffset', () => {
  it('routes hours to clock arithmetic and days/weeks to calendar arithmetic', () => {
    const start = fromZonedDateString('2026-10-20', LONDON, { hour: 14, minute: 0 });
    expect(addOffset(start, 24, 'hours', LONDON).getTime()).toBe(start.getTime() + 86_400_000);
    expect(toWallClock(addOffset(start, 4, 'weeks', LONDON), LONDON)).toMatchObject({
      month: 11,
      day: 17,
      hour: 14,
    });
  });

  it('supports negative offsets for pre-discharge deadlines', () => {
    const discharge = fromZonedDateString('2026-11-17', LONDON, { hour: 17, minute: 0 });
    expect(toWallClock(addOffset(discharge, -24, 'hours', LONDON), LONDON)).toMatchObject({
      day: 16,
      hour: 17,
    });
  });
});

describe('round-tripping wall clock and instants', () => {
  it('survives a conversion in both directions', () => {
    for (const date of ['2026-01-15', '2026-06-15', '2026-03-29', '2026-10-25']) {
      const instant = fromZonedDateString(date, LONDON, { hour: 12, minute: 0 });
      expect(toZonedDateString(instant, LONDON)).toBe(date);
      expect(toWallClock(instant, LONDON).hour).toBe(12);
    }
  });

  it('rejects a malformed date string', () => {
    expect(() => fromZonedDateString('15/06/2026', LONDON)).toThrow(/YYYY-MM-DD/);
  });

  it('resolves the non-existent spring-forward hour deterministically', () => {
    // 01:30 on 29 March 2026 does not exist in London.
    const resolved = fromZonedDateString('2026-03-29', LONDON, { hour: 1, minute: 30 });
    expect(Number.isNaN(resolved.getTime())).toBe(false);
    expect(toZonedDateString(resolved, LONDON)).toBe('2026-03-29');
  });
});

describe('calendarDaysBetween', () => {
  it('counts date boundaries crossed, not elapsed hours', () => {
    const late = fromZonedDateString('2026-06-01', LONDON, { hour: 23, minute: 0 });
    const early = fromZonedDateString('2026-06-02', LONDON, { hour: 1, minute: 0 });
    expect(calendarDaysBetween(late, early, LONDON)).toBe(1);
  });

  it('measures a 28-day programme as 28 days even across a DST change', () => {
    const admitted = fromZonedDateString('2026-10-20', LONDON, { hour: 14, minute: 0 });
    const discharge = addCalendar(admitted, 28, 'days', LONDON);
    expect(calendarDaysBetween(admitted, discharge, LONDON)).toBe(28);
  });

  it('returns 0 for two instants on the same local date', () => {
    const a = fromZonedDateString('2026-06-01', LONDON, { hour: 8, minute: 0 });
    const b = fromZonedDateString('2026-06-01', LONDON, { hour: 20, minute: 0 });
    expect(calendarDaysBetween(a, b, LONDON)).toBe(0);
    expect(isSameZonedDate(a, b, LONDON)).toBe(true);
  });
});

describe('zonedWeekday and daysLeftInWeek', () => {
  // 2026-08-10 is a Monday.
  it('counts Monday as 0 and Sunday as 6', () => {
    expect(zonedWeekday(fromZonedDateString('2026-08-10', LONDON, { hour: 12, minute: 0 }), LONDON)).toBe(0);
    expect(zonedWeekday(fromZonedDateString('2026-08-16', LONDON, { hour: 12, minute: 0 }), LONDON)).toBe(6);
  });

  it('gives a full week ahead on Monday and none on Sunday', () => {
    expect(daysLeftInWeek(fromZonedDateString('2026-08-10', LONDON, { hour: 9, minute: 0 }), LONDON)).toBe(6);
    expect(daysLeftInWeek(fromZonedDateString('2026-08-14', LONDON, { hour: 9, minute: 0 }), LONDON)).toBe(2);
    expect(daysLeftInWeek(fromZonedDateString('2026-08-16', LONDON, { hour: 9, minute: 0 }), LONDON)).toBe(0);
  });

  it('reads the weekday in the centre zone, not UTC', () => {
    // 23:30 Sunday in London is already Monday in Athens (+2). The zone must decide the weekday.
    const lateSunday = fromZonedDateString('2026-08-16', LONDON, { hour: 23, minute: 30 });
    expect(zonedWeekday(lateSunday, LONDON)).toBe(6);
    expect(zonedWeekday(lateSunday, 'Europe/Athens')).toBe(0);
  });
});

describe('zone independence', () => {
  it('produces different instants for the same wall clock in different zones', () => {
    const london = fromZonedDateString('2026-07-01', LONDON, { hour: 9, minute: 0 });
    const dublin = fromZonedDateString('2026-07-01', 'Europe/Athens', { hour: 9, minute: 0 });
    expect(london.getTime()).not.toBe(dublin.getTime());
  });
});
