import { describe, expect, it } from 'vitest';
import { PRIMROSE_LODGE_SETTINGS, type CentreSettings } from './centre-settings.js';
import {
  calculatePlannedDischargeDate,
  deriveDurationDays,
  preDischargeContactDueAt,
  reconcileDurationAgainstDischarge,
  validateDischargeDateChange,
} from './discharge.js';
import { fromZonedDateString, toWallClock, toZonedDateString } from './zoned-time.js';

const LONDON = 'Europe/London';
const settings = PRIMROSE_LODGE_SETTINGS;
const exclusive: CentreSettings = { ...settings, dischargeInclusiveOfAdmissionDay: false };

const admittedOn = (date: string, hour = 11) => fromZonedDateString(date, LONDON, { hour, minute: 0 });

describe('calculatePlannedDischargeDate — inclusive of the admission day (BR-7)', () => {
  it('treats the admission day as day 1', () => {
    // 28-day programme starting 1 June ends 28 June, not 29 June.
    expect(
      calculatePlannedDischargeDate(admittedOn('2026-06-01'), { amount: 28, unit: 'days' }, settings),
    ).toBe('2026-06-28');
  });

  it('handles a 10-day programme', () => {
    expect(
      calculatePlannedDischargeDate(admittedOn('2026-06-01'), { amount: 10, unit: 'days' }, settings),
    ).toBe('2026-06-10');
  });

  it('handles a single-day admission', () => {
    expect(
      calculatePlannedDischargeDate(admittedOn('2026-06-01'), { amount: 1, unit: 'days' }, settings),
    ).toBe('2026-06-01');
  });

  it('accepts weeks and converts them', () => {
    expect(
      calculatePlannedDischargeDate(admittedOn('2026-06-01'), { amount: 4, unit: 'weeks' }, settings),
    ).toBe('2026-06-28');
  });

  it('rolls over month and year boundaries', () => {
    expect(
      calculatePlannedDischargeDate(admittedOn('2026-12-20'), { amount: 28, unit: 'days' }, settings),
    ).toBe('2027-01-16');
  });
});

describe('calculatePlannedDischargeDate — exclusive variant (pending Q3)', () => {
  it('is one day later when the admission day does not count', () => {
    expect(
      calculatePlannedDischargeDate(admittedOn('2026-06-01'), { amount: 28, unit: 'days' }, exclusive),
    ).toBe('2026-06-29');
  });

  it('means the rule is configuration, not a code path', () => {
    const admitted = admittedOn('2026-06-01');
    const a = calculatePlannedDischargeDate(admitted, { amount: 28, unit: 'days' }, settings);
    const b = calculatePlannedDischargeDate(admitted, { amount: 28, unit: 'days' }, exclusive);
    expect(a).not.toBe(b);
  });
});

describe('calculatePlannedDischargeDate — DST safety', () => {
  it('gives a 28-day stay the correct end date across the autumn change', () => {
    // Admitted during BST, discharged during GMT.
    expect(
      calculatePlannedDischargeDate(admittedOn('2026-10-20', 14), { amount: 28, unit: 'days' }, settings),
    ).toBe('2026-11-16');
  });

  it('is unaffected by a near-midnight admission time', () => {
    for (const hour of [0, 1, 12, 23]) {
      expect(
        calculatePlannedDischargeDate(admittedOn('2026-10-24', hour), { amount: 7, unit: 'days' }, settings),
      ).toBe('2026-10-30');
    }
  });
});

describe('calculatePlannedDischargeDate — validation', () => {
  it.each([0, -5, 2.5])('rejects a duration of %s', (amount) => {
    expect(() =>
      calculatePlannedDischargeDate(admittedOn('2026-06-01'), { amount, unit: 'days' }, settings),
    ).toThrow(/positive whole number/);
  });
});

describe('deriveDurationDays', () => {
  it('inverts the inclusive calculation', () => {
    expect(deriveDurationDays(admittedOn('2026-06-01'), '2026-06-28', settings)).toBe(28);
  });

  it('inverts the exclusive calculation', () => {
    expect(deriveDurationDays(admittedOn('2026-06-01'), '2026-06-29', exclusive)).toBe(28);
  });

  it('round-trips for a range of durations', () => {
    for (const amount of [1, 7, 10, 14, 28, 90]) {
      const admitted = admittedOn('2026-02-10');
      const discharge = calculatePlannedDischargeDate(admitted, { amount, unit: 'days' }, settings);
      expect(deriveDurationDays(admitted, discharge, settings)).toBe(amount);
    }
  });
});

describe('reconcileDurationAgainstDischarge (import support)', () => {
  it('reports agreement when duration and discharge date match', () => {
    const result = reconcileDurationAgainstDischarge(
      admittedOn('2026-06-01'),
      { amount: 28, unit: 'days' },
      '2026-06-28',
      settings,
    );
    expect(result).toEqual({ kind: 'agrees', deltaDays: 0 });
  });

  it('flags a one-day discrepancy as a minor mismatch and derives the real duration', () => {
    const result = reconcileDurationAgainstDischarge(
      admittedOn('2026-06-01'),
      { amount: 28, unit: 'days' },
      '2026-06-26',
      settings,
    );
    expect(result.kind).toBe('minor_mismatch');
    if (result.kind !== 'minor_mismatch') throw new Error('unreachable');
    expect(result.deltaDays).toBe(-2);
    expect(result.derivedDurationDays).toBe(26);
  });

  it('flags a large gap as a probable extension and reconstructs the original plan', () => {
    // The shape of the anomalous workbook row: a 28-day duration against a ~57-day stay.
    const result = reconcileDurationAgainstDischarge(
      admittedOn('2026-06-01'),
      { amount: 28, unit: 'days' },
      '2026-07-27',
      settings,
    );
    expect(result.kind).toBe('probable_extension');
    if (result.kind !== 'probable_extension') throw new Error('unreachable');
    expect(result.deltaDays).toBe(29);
    // The original plan becomes visible again rather than being lost.
    expect(result.inferredOriginalDischargeDate).toBe('2026-06-28');
  });

  it('respects a configurable tolerance', () => {
    const tight = reconcileDurationAgainstDischarge(
      admittedOn('2026-06-01'),
      { amount: 28, unit: 'days' },
      '2026-06-30',
      settings,
      1,
    );
    expect(tight.kind).toBe('probable_extension');
  });
});

describe('preDischargeContactDueAt (BR-18)', () => {
  it('is 24 hours before the discharge-day deadline time', () => {
    const due = preDischargeContactDueAt('2026-06-28', settings);
    expect(toZonedDateString(due, LONDON)).toBe('2026-06-27');
    expect(toWallClock(due, LONDON)).toMatchObject({ hour: 17, minute: 0 });
  });

  it('lands on the previous calendar day, matching the workbook convention', () => {
    // In the source spreadsheet '24h prior to leaving' equals discharge - 1 day in 5 of 6 rows.
    for (const discharge of ['2026-01-15', '2026-06-28', '2026-11-17']) {
      const due = preDischargeContactDueAt(discharge, settings);
      const expected = new Date(Date.parse(`${discharge}T00:00:00Z`) - 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect(toZonedDateString(due, LONDON)).toBe(expected);
    }
  });

  it('keeps the local deadline time across the autumn clock change', () => {
    const due = preDischargeContactDueAt('2026-10-26', settings);
    expect(toWallClock(due, LONDON)).toMatchObject({ day: 25, hour: 17 });
  });

  it('honours a different notice period', () => {
    const due = preDischargeContactDueAt('2026-06-28', { ...settings, preDischargeContactHours: 48 });
    expect(toZonedDateString(due, LONDON)).toBe('2026-06-26');
  });
});

describe('validateDischargeDateChange (BR-9)', () => {
  const base = {
    admissionId: 'adm-1',
    previousDate: '2026-06-28',
    newDate: '2026-07-12',
    reason: 'Clinical team agreed a two-week extension',
    changedBy: 'user-1',
  };

  it('accepts a well-formed change', () => {
    expect(() => validateDischargeDateChange(base)).not.toThrow();
  });

  it('requires a reason', () => {
    expect(() => validateDischargeDateChange({ ...base, reason: '   ' })).toThrow(/reason is required/);
  });

  it('rejects a no-op change', () => {
    expect(() => validateDischargeDateChange({ ...base, newDate: base.previousDate })).toThrow(
      /identical/,
    );
  });

  it('rejects a malformed date', () => {
    expect(() => validateDischargeDateChange({ ...base, newDate: '12/07/2026' })).toThrow(/YYYY-MM-DD/);
  });
});
