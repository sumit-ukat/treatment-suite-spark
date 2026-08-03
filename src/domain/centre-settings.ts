/**
 * Per-centre operational configuration.
 *
 * Everything here is a value in `centres.settings` (jsonb), never a constant in code. Primrose
 * Lodge is the first centre, not the shape of the product — a second centre with a different
 * programme length, review day or eligibility rule is data entry.
 *
 * Several defaults are provisional pending confirmation; each is marked with its open question so
 * an answer changes a value rather than a code path.
 */

export interface CentreSettings {
  /** IANA zone. All wall-clock reasoning happens here. */
  timezone: string;

  /**
   * Does the admission day count as day 1?
   *
   * `true`  → discharge = admission + duration − 1  (6 of 8 workbook rows fit this)
   * `false` → discharge = admission + duration
   *
   * Provisional — see OPEN_QUESTIONS Q3 and DECISIONS D-015.
   */
  dischargeInclusiveOfAdmissionDay: boolean;

  /** Default programme length. 28 days for 7 of 8 clients in the workbook. */
  defaultDurationDays: number;

  /** Elapsed hours from admission before a family meeting or visit may occur. Q13. */
  familyMeetingEligibilityHours: number;

  /** Elapsed hours from admission by which initial family contact is due. Q12. */
  initialFamilyContactHours: number;

  /** Hours before planned discharge that the pre-discharge family contact is due. */
  preDischargeContactHours: number;

  /** ISO weekday (1 = Monday) on which the centre's doctor reviews take place. Q38. */
  doctorReviewWeekday: number;

  /** Local time of day used when a rule yields a date but no time. */
  defaultDeadlineTimeOfDay: { hour: number; minute: number };
}

/**
 * Primrose Lodge, seeded from the workbook.
 *
 * The 28-day default and the Thursday review day are read from the source spreadsheet; the
 * eligibility and contact windows are from the brief. None of them is hard-coded anywhere else.
 */
export const PRIMROSE_LODGE_SETTINGS: CentreSettings = {
  timezone: 'Europe/London',
  dischargeInclusiveOfAdmissionDay: true, // provisional, Q3
  defaultDurationDays: 28,
  familyMeetingEligibilityHours: 168, // provisional, Q13
  initialFamilyContactHours: 24,
  preDischargeContactHours: 24,
  doctorReviewWeekday: 4, // Thursday — column AG header; provisional, Q38
  defaultDeadlineTimeOfDay: { hour: 17, minute: 0 },
};
