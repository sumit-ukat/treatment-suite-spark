/**
 * Family meeting / visit eligibility. BR-19, BR-20, BR-21.
 *
 * A client must complete one week in treatment before a family meeting or visit may take place.
 *
 * Three things about this rule are worth stating, because none is obvious from the source data:
 *
 * 1. It is **not evidenced in the workbook at all**. `Family Vist` is a single boolean with no date
 *    — TRUE once, FALSE fourteen times (including on empty rooms), blank three times. This rule
 *    comes from the brief and must be treated as a stated requirement, not an observed pattern.
 *
 * 2. `eligibleFrom` is computed once at admission and **stored on the meeting record**. If a centre
 *    later changes its eligibility window, meetings already scheduled keep the rule that applied at
 *    the time. Recomputing on read would silently rewrite history.
 *
 * 3. There is **no override** in v1, per the brief. An override that exists gets used, and a rule
 *    with a routine bypass is not a rule. An early departure is handled by cancelling the meeting
 *    with a reason (BR-21) — never by marking it complete.
 */

import type { CentreSettings } from './centre-settings.js';
import { addHours } from './zoned-time.js';

export type FamilyMeetingStatus =
  | 'requested'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'not_applicable';

export interface FamilyMeetingEligibility {
  eligibleFrom: Date;
  isEligibleNow: boolean;
  hoursRemaining: number;
}

/**
 * The instant from which a family meeting may occur.
 *
 * Measured as elapsed hours from admission, so it is unaffected by the BST/GMT transition — 168
 * hours is 168 hours. Whether the organisation means exactly 168 hours or "the start of the eighth
 * calendar day" is Q13; the window is configuration, so the answer changes a number.
 */
export function calculateEligibleFrom(admittedAt: Date, settings: CentreSettings): Date {
  return addHours(admittedAt, settings.familyMeetingEligibilityHours);
}

export function assessEligibility(
  admittedAt: Date,
  settings: CentreSettings,
  now: Date,
): FamilyMeetingEligibility {
  const eligibleFrom = calculateEligibleFrom(admittedAt, settings);
  const msRemaining = eligibleFrom.getTime() - now.getTime();
  return {
    eligibleFrom,
    isEligibleNow: msRemaining <= 0,
    hoursRemaining: Math.max(0, msRemaining / 3_600_000),
  };
}

export class FamilyMeetingNotYetEligibleError extends Error {
  constructor(
    readonly proposedAt: Date,
    readonly eligibleFrom: Date,
  ) {
    super(
      `A family meeting cannot be scheduled for ${proposedAt.toISOString()} — ` +
        `this client is not eligible until ${eligibleFrom.toISOString()}.`,
    );
    this.name = 'FamilyMeetingNotYetEligibleError';
  }
}

/**
 * Validate a proposed meeting date against the stored eligibility instant.
 *
 * This is one of four layers enforcing the same rule. The others are a database CHECK constraint, a
 * disabled date picker, and rejection-plus-audit at the API boundary. The picker is convenience;
 * the constraint is the guarantee.
 *
 * The boundary is inclusive: a meeting at exactly `eligibleFrom` is permitted.
 */
export function assertMeetingDateAllowed(proposedAt: Date, eligibleFrom: Date): void {
  if (proposedAt.getTime() < eligibleFrom.getTime()) {
    throw new FamilyMeetingNotYetEligibleError(proposedAt, eligibleFrom);
  }
}

/**
 * Resolve an outstanding family meeting when a client leaves before becoming eligible. BR-21.
 *
 * Never returns `completed`. The meeting did not happen, and recording that it did would be
 * fabricating evidence in a system whose purpose is to provide it.
 */
export function resolveMeetingOnEarlyDischarge(
  currentStatus: FamilyMeetingStatus,
  reason: string,
): { status: Extract<FamilyMeetingStatus, 'cancelled' | 'not_applicable' | 'completed'>; reason: string } {
  if (!reason.trim()) {
    throw new Error('A reason is required when closing a family meeting at early discharge');
  }
  if (currentStatus === 'completed') {
    // Already happened before the early discharge — leave it alone.
    return { status: 'completed', reason };
  }
  return {
    status: currentStatus === 'scheduled' ? 'cancelled' : 'not_applicable',
    reason,
  };
}

/**
 * The seven-day rule gates meetings only. BR-20.
 *
 * The 24-hour initial family contact is a separate obligation and must never be suppressed by
 * eligibility — conflating them would delay a required contact by a week.
 */
export function eligibilityAffectsFamilyContact(): false {
  return false;
}
