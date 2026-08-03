import { describe, expect, it } from 'vitest';
import { PRIMROSE_LODGE_SETTINGS } from './centre-settings.js';
import {
  assertMeetingDateAllowed,
  assessEligibility,
  calculateEligibleFrom,
  eligibilityAffectsFamilyContact,
  FamilyMeetingNotYetEligibleError,
  resolveMeetingOnEarlyDischarge,
} from './eligibility.js';
import { addHours, fromZonedDateString, toWallClock } from './zoned-time.js';

const LONDON = 'Europe/London';
const settings = PRIMROSE_LODGE_SETTINGS;
const admittedAt = fromZonedDateString('2026-06-01', LONDON, { hour: 14, minute: 30 });

describe('calculateEligibleFrom (BR-19)', () => {
  it('is exactly 168 elapsed hours after admission', () => {
    const eligibleFrom = calculateEligibleFrom(admittedAt, settings);
    expect(eligibleFrom.getTime() - admittedAt.getTime()).toBe(168 * 3_600_000);
    expect(toWallClock(eligibleFrom, LONDON)).toMatchObject({ day: 8, hour: 14, minute: 30 });
  });

  it('stays 168 elapsed hours across the autumn clock change', () => {
    // Admitted during BST, eligible during GMT: the elapsed window must not change.
    const october = fromZonedDateString('2026-10-22', LONDON, { hour: 14, minute: 0 });
    const eligibleFrom = calculateEligibleFrom(october, settings);
    expect(eligibleFrom.getTime() - october.getTime()).toBe(168 * 3_600_000);
    // By the clock this reads an hour earlier, which is the correct consequence of an elapsed rule.
    expect(toWallClock(eligibleFrom, LONDON)).toMatchObject({ day: 29, hour: 13 });
  });

  it('honours a different configured window (Q13 may change this)', () => {
    const eightDays = calculateEligibleFrom(admittedAt, {
      ...settings,
      familyMeetingEligibilityHours: 192,
    });
    expect(toWallClock(eightDays, LONDON)).toMatchObject({ day: 9, hour: 14 });
  });
});

describe('assessEligibility', () => {
  it('reports ineligible with hours remaining before the window', () => {
    const result = assessEligibility(admittedAt, settings, addHours(admittedAt, 100));
    expect(result.isEligibleNow).toBe(false);
    expect(result.hoursRemaining).toBe(68);
  });

  it('reports eligible exactly on the boundary', () => {
    const result = assessEligibility(admittedAt, settings, calculateEligibleFrom(admittedAt, settings));
    expect(result.isEligibleNow).toBe(true);
    expect(result.hoursRemaining).toBe(0);
  });

  it('never reports negative hours remaining', () => {
    const result = assessEligibility(admittedAt, settings, addHours(admittedAt, 1000));
    expect(result.hoursRemaining).toBe(0);
  });
});

describe('assertMeetingDateAllowed — the boundary', () => {
  const eligibleFrom = calculateEligibleFrom(admittedAt, settings);

  it('rejects one millisecond before eligibility', () => {
    expect(() => assertMeetingDateAllowed(new Date(eligibleFrom.getTime() - 1), eligibleFrom)).toThrow(
      FamilyMeetingNotYetEligibleError,
    );
  });

  it('permits exactly the eligibility instant', () => {
    expect(() => assertMeetingDateAllowed(eligibleFrom, eligibleFrom)).not.toThrow();
  });

  it('permits any later instant', () => {
    expect(() => assertMeetingDateAllowed(addHours(eligibleFrom, 1), eligibleFrom)).not.toThrow();
  });

  it('rejects a meeting on day 6, the case the rule exists to prevent', () => {
    const daySix = addHours(admittedAt, 144);
    expect(() => assertMeetingDateAllowed(daySix, eligibleFrom)).toThrow(/not eligible until/);
  });

  it('carries both instants on the error for auditing the rejected attempt', () => {
    const proposed = addHours(admittedAt, 24);
    try {
      assertMeetingDateAllowed(proposed, eligibleFrom);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FamilyMeetingNotYetEligibleError);
      const e = error as FamilyMeetingNotYetEligibleError;
      expect(e.proposedAt).toEqual(proposed);
      expect(e.eligibleFrom).toEqual(eligibleFrom);
    }
  });
});

describe('resolveMeetingOnEarlyDischarge (BR-21)', () => {
  it('cancels a scheduled meeting', () => {
    expect(resolveMeetingOnEarlyDischarge('scheduled', 'Client left against advice')).toEqual({
      status: 'cancelled',
      reason: 'Client left against advice',
    });
  });

  it('marks a merely requested meeting not applicable', () => {
    expect(resolveMeetingOnEarlyDischarge('requested', 'Early discharge on day 4').status).toBe(
      'not_applicable',
    );
  });

  it('never fabricates completion', () => {
    for (const status of ['requested', 'scheduled', 'not_applicable'] as const) {
      expect(resolveMeetingOnEarlyDischarge(status, 'Early discharge').status).not.toBe('completed');
    }
  });

  it('leaves a genuinely completed meeting alone', () => {
    expect(resolveMeetingOnEarlyDischarge('completed', 'Early discharge').status).toBe('completed');
  });

  it('requires a reason', () => {
    expect(() => resolveMeetingOnEarlyDischarge('scheduled', '  ')).toThrow(/reason is required/);
  });
});

describe('BR-20 — eligibility does not gate the 24-hour family contact', () => {
  it('is explicitly independent', () => {
    expect(eligibilityAffectsFamilyContact()).toBe(false);
  });

  it('leaves the 24-hour contact due on day 1 while a meeting waits until day 8', () => {
    const contactDue = addHours(admittedAt, settings.initialFamilyContactHours);
    const meetingEligible = calculateEligibleFrom(admittedAt, settings);
    expect(toWallClock(contactDue, LONDON).day).toBe(2);
    expect(toWallClock(meetingEligible, LONDON).day).toBe(8);
    expect(contactDue.getTime()).toBeLessThan(meetingEligible.getTime());
  });
});
