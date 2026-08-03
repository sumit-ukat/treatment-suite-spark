/**
 * Discharge date calculation and change handling.
 *
 * BR-7  planned discharge = admission + duration − 1 (when inclusive of the admission day)
 * BR-8  the original planned discharge date is immutable
 * BR-10 changing the current planned discharge recalculates only *open* discharge-based tasks
 *
 * The immutability in BR-8 exists because of one row in the source workbook: a client admitted
 * 2026-06-02 with a recorded 28-day duration and a discharge date of 2026-07-29 — a 57-day stay.
 * Almost certainly an extension, but the spreadsheet keeps one value per cell, so the original plan,
 * the person who changed it and the reason are all simply gone.
 */

import type { CentreSettings } from './centre-settings.js';
import { addCalendar, addHours, fromZonedDateString, toZonedDateString } from './zoned-time.js';

export interface DurationSpec {
  amount: number;
  unit: 'days' | 'weeks';
}

/** Calculate the planned discharge date (a calendar date in centre time). */
export function calculatePlannedDischargeDate(
  admittedAt: Date,
  duration: DurationSpec,
  settings: CentreSettings,
): string {
  if (!Number.isInteger(duration.amount) || duration.amount <= 0) {
    throw new Error(`Treatment duration must be a positive whole number, received ${duration.amount}`);
  }
  const days = duration.unit === 'weeks' ? duration.amount * 7 : duration.amount;
  const offset = settings.dischargeInclusiveOfAdmissionDay ? days - 1 : days;
  return toZonedDateString(addCalendar(admittedAt, offset, 'days', settings.timezone), settings.timezone);
}

/**
 * Derive duration from recorded admission and discharge dates.
 *
 * Used by the import to reconcile the workbook's two disagreeing sources of truth (the duration
 * column and the discharge column). Inverse of the above.
 */
export function deriveDurationDays(
  admittedAt: Date,
  plannedDischargeDate: string,
  settings: CentreSettings,
): number {
  const admitted = toZonedDateString(admittedAt, settings.timezone);
  const msPerDay = 86_400_000;
  const spanDays = Math.round(
    (Date.parse(`${plannedDischargeDate}T00:00:00Z`) - Date.parse(`${admitted}T00:00:00Z`)) / msPerDay,
  );
  return settings.dischargeInclusiveOfAdmissionDay ? spanDays + 1 : spanDays;
}

export type DischargeReconciliation =
  | { kind: 'agrees'; deltaDays: 0 }
  | { kind: 'minor_mismatch'; deltaDays: number; derivedDurationDays: number }
  | { kind: 'probable_extension'; deltaDays: number; inferredOriginalDischargeDate: string };

/**
 * Compare a recorded duration against a recorded discharge date (import support).
 *
 * Six of eight workbook rows agree. One is off by a day. One is off by 29 days — and that last case
 * is reconstructed as an extension so the original plan becomes visible again, clearly labelled as
 * inferred rather than observed.
 */
export function reconcileDurationAgainstDischarge(
  admittedAt: Date,
  duration: DurationSpec,
  recordedDischargeDate: string,
  settings: CentreSettings,
  minorMismatchToleranceDays = 2,
): DischargeReconciliation {
  const calculated = calculatePlannedDischargeDate(admittedAt, duration, settings);
  const msPerDay = 86_400_000;
  const deltaDays = Math.round(
    (Date.parse(`${recordedDischargeDate}T00:00:00Z`) - Date.parse(`${calculated}T00:00:00Z`)) / msPerDay,
  );

  if (deltaDays === 0) return { kind: 'agrees', deltaDays: 0 };
  if (Math.abs(deltaDays) <= minorMismatchToleranceDays) {
    return {
      kind: 'minor_mismatch',
      deltaDays,
      derivedDurationDays: deriveDurationDays(admittedAt, recordedDischargeDate, settings),
    };
  }
  return { kind: 'probable_extension', deltaDays, inferredOriginalDischargeDate: calculated };
}

/**
 * The deadline for the pre-discharge family contact. BR-18.
 *
 * Anchored to the discharge day's local deadline time in the centre's zone, then wound back by the
 * configured notice period. In the workbook this equals `discharge − 1 day` in five of six rows —
 * computed by hand, and therefore left stale when a discharge date later moved.
 */
export function preDischargeContactDueAt(
  plannedDischargeDate: string,
  settings: CentreSettings,
): Date {
  const dischargeMoment = fromZonedDateString(
    plannedDischargeDate,
    settings.timezone,
    settings.defaultDeadlineTimeOfDay,
  );
  return addHours(dischargeMoment, -settings.preDischargeContactHours);
}

export interface DischargeDateChange {
  admissionId: string;
  previousDate: string;
  newDate: string;
  reason: string;
  changedBy: string;
}

/**
 * Validate a change to the current planned discharge date.
 *
 * A reason is mandatory (BR-9). The original date is never an input here, because it cannot be
 * changed at all (BR-8) — that is enforced by a database trigger, not by this function.
 */
export function validateDischargeDateChange(change: DischargeDateChange): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(change.newDate)) {
    throw new Error(`New discharge date must be YYYY-MM-DD, received '${change.newDate}'`);
  }
  if (change.newDate === change.previousDate) {
    throw new Error('New discharge date is identical to the current one');
  }
  if (change.reason.trim().length < 3) {
    throw new Error('A reason is required when changing the planned discharge date');
  }
}
