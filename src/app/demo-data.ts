/**
 * FICTIONAL demonstration data.
 *
 * Every name, substance, note and photograph state here is invented. Nothing derives from the
 * source whiteboard except the bed layout, which is reference data, not client data.
 *
 * This module exists because the clients/admissions schema does not exist yet. What it is NOT is a
 * mock of the business rules: every date, treatment day, deadline and overdue flag below is
 * computed by the same tested functions the real application will call. The fixtures supply
 * admission dates and which tasks got done; the domain layer works out everything else.
 */

import { PRIMROSE_LODGE_SETTINGS } from '../domain/centre-settings.js';
import { calculatePlannedDischargeDate } from '../domain/discharge.js';
import { assessEligibility } from '../domain/eligibility.js';
import { computeDueAt, isOverdue, type TaskTemplate } from '../domain/tasks.js';
import { calendarDaysBetween, fromZonedDateString } from '../domain/zoned-time.js';

const settings = PRIMROSE_LODGE_SETTINGS;
const TZ = settings.timezone;

/** The board is read at a fixed instant so the demo is stable and reviewable. */
export const NOW = fromZonedDateString('2026-08-03', TZ, { hour: 9, minute: 30 });

/**
 * Bed layout for Primrose Lodge — the exact order verified in the database.
 * 16 rooms, 18 bed spaces; rooms 6 and 9 are shared and appear only as A/B beds.
 */
export const BED_LAYOUT: ReadonlyArray<{ label: string; room: string; shared: boolean }> = [
  { label: '1', room: '1', shared: false },
  { label: '2', room: '2', shared: false },
  { label: '3', room: '3', shared: false },
  { label: '4', room: '4', shared: false },
  { label: '5', room: '5', shared: false },
  { label: '6A', room: '6', shared: true },
  { label: '6B', room: '6', shared: true },
  { label: '7', room: '7', shared: false },
  { label: '8', room: '8', shared: false },
  { label: '9A', room: '9', shared: true },
  { label: '9B', room: '9', shared: true },
  { label: '10', room: '10', shared: false },
  { label: '11', room: '11', shared: false },
  { label: '12', room: '12', shared: false },
  { label: '13', room: '13', shared: false },
  { label: '14', room: '14', shared: false },
  { label: '15', room: '15', shared: false },
  { label: '16', room: '16', shared: false },
];

/** Task templates, modelled on the whiteboard's action columns. */
export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  { code: 'family_contact_24h', name: '24-hour family contact', category: 'family_contact', dueBasis: 'admission', dueOffset: 24, dueOffsetUnit: 'hours', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 1 },
  { code: 'family_contact_week_1', name: 'Week 1 family contact', category: 'family_contact', dueBasis: 'admission', dueOffset: 1, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 1 },
  { code: 'family_contact_week_2', name: 'Week 2 family contact', category: 'family_contact', dueBasis: 'admission', dueOffset: 2, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 1 },
  { code: 'satisfaction_survey_7day', name: '7-day satisfaction survey', category: 'survey', dueBasis: 'admission', dueOffset: 7, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 1 },
  { code: 'life_story', name: 'Life story / surrender', category: 'milestone', dueBasis: 'admission', dueOffset: 10, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'step_1', name: 'Step 1', category: 'milestone', dueBasis: 'admission', dueOffset: 12, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'step_2', name: 'Step 2', category: 'milestone', dueBasis: 'admission', dueOffset: 18, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'step_3', name: 'Step 3', category: 'milestone', dueBasis: 'admission', dueOffset: 24, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_intro', name: 'Intro session', category: 'session', dueBasis: 'admission', dueOffset: 0, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_week_1', name: 'Week 1 session', category: 'session', dueBasis: 'admission', dueOffset: 1, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_week_2', name: 'Week 2 session', category: 'session', dueBasis: 'admission', dueOffset: 2, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_week_3', name: 'Week 3 session', category: 'session', dueBasis: 'admission', dueOffset: 3, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'gp_summary', name: 'GP summary', category: 'medical', dueBasis: 'admission', dueOffset: 5, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 3 },
  { code: 'family_contact_pre_discharge', name: 'Pre-discharge family contact', category: 'family_contact', dueBasis: 'planned_discharge', dueOffset: -24, dueOffsetUnit: 'hours', isRequired: true, rescheduleOnDischargeChange: true, visibilityLevel: 1 },
  { code: 'discharge_prep', name: 'Discharge preparation', category: 'discharge', dueBasis: 'planned_discharge', dueOffset: -3, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: true, visibilityLevel: 1 },
];

interface Fixture {
  bed: string;
  reference: string;
  displayName: string;
  admittedOn: string;
  admittedHour: number;
  durationDays: number;
  substance: string;
  therapist: string;
  buddy: string;
  group: string;
  photoState: 'verified' | 'unverified' | 'missing';
  hasRestrictedAlert: boolean;
  /** Template codes completed. Anything else stays open and may become overdue. */
  completed: readonly string[];
}

/** Eight fictional admissions, mirroring the whiteboard's 8-of-18 occupancy. */
const FIXTURES: readonly Fixture[] = [
  {
    bed: '1', reference: 'PL-1042', displayName: 'A. Whitfield', admittedOn: '2026-07-22', admittedHour: 14,
    durationDays: 28, substance: 'Alcohol', therapist: 'R. Ellery', buddy: 'T. Nkemi', group: 'A',
    photoState: 'verified', hasRestrictedAlert: false,
    completed: ['family_contact_24h', 'family_contact_week_1', 'satisfaction_survey_7day', 'session_intro', 'session_week_1', 'gp_summary', 'life_story'],
  },
  {
    bed: '3', reference: 'PL-1017', displayName: 'M. Oyelaran', admittedOn: '2026-06-20', admittedHour: 11,
    durationDays: 28, substance: 'Alcohol', therapist: 'S. Brandt', buddy: 'A. Whitfield', group: 'A',
    photoState: 'verified', hasRestrictedAlert: true,
    completed: ['family_contact_24h', 'family_contact_week_1', 'family_contact_week_2', 'satisfaction_survey_7day', 'session_intro', 'session_week_1', 'session_week_2', 'session_week_3', 'gp_summary', 'life_story', 'step_1', 'step_2'],
  },
  {
    bed: '4', reference: 'PL-1051', displayName: 'J. Calloway', admittedOn: '2026-07-30', admittedHour: 16,
    durationDays: 28, substance: 'Cocaine', therapist: 'R. Ellery', buddy: 'M. Oyelaran', group: 'B',
    photoState: 'verified', hasRestrictedAlert: false,
    completed: ['family_contact_24h', 'session_intro'],
  },
  {
    bed: '5', reference: 'PL-1008', displayName: 'D. Fenwick', admittedOn: '2026-07-08', admittedHour: 10,
    durationDays: 28, substance: 'Alcohol', therapist: 'S. Brandt', buddy: 'T. Nkemi', group: 'A',
    photoState: 'verified', hasRestrictedAlert: false,
    completed: ['family_contact_24h', 'family_contact_week_1', 'family_contact_week_2', 'satisfaction_survey_7day', 'session_intro', 'session_week_1', 'session_week_2', 'session_week_3', 'gp_summary', 'life_story', 'step_1'],
  },
  {
    bed: '7', reference: 'PL-1053', displayName: 'K. Amankwah', admittedOn: '2026-08-02', admittedHour: 19,
    durationDays: 28, substance: 'Alcohol', therapist: 'L. Vance', buddy: 'D. Fenwick', group: 'B',
    photoState: 'unverified', hasRestrictedAlert: false,
    completed: [],
  },
  {
    bed: '10', reference: 'PL-1039', displayName: 'P. Ridley', admittedOn: '2026-07-25', admittedHour: 12,
    durationDays: 10, substance: 'Alcohol', therapist: 'L. Vance', buddy: 'A. Whitfield', group: 'A',
    photoState: 'missing', hasRestrictedAlert: false,
    completed: ['family_contact_24h', 'satisfaction_survey_7day', 'session_intro', 'session_week_1', 'gp_summary'],
  },
  {
    bed: '15', reference: 'PL-1024', displayName: 'H. Duignan', admittedOn: '2026-07-15', admittedHour: 9,
    durationDays: 28, substance: 'Alcohol', therapist: 'R. Ellery', buddy: 'J. Calloway', group: 'A',
    photoState: 'verified', hasRestrictedAlert: false,
    completed: ['family_contact_24h', 'family_contact_week_1', 'family_contact_week_2', 'satisfaction_survey_7day', 'session_intro', 'session_week_1', 'session_week_2', 'gp_summary', 'life_story', 'step_1'],
  },
  {
    bed: '16', reference: 'PL-1047', displayName: 'C. Marchetti', admittedOn: '2026-07-28', admittedHour: 13,
    durationDays: 28, substance: 'Alcohol', therapist: 'S. Brandt', buddy: 'H. Duignan', group: 'A',
    photoState: 'verified', hasRestrictedAlert: false,
    completed: ['family_contact_24h', 'session_intro', 'family_contact_week_1', 'session_week_1'],
  },
];

export interface BoardTask {
  code: string;
  title: string;
  category: TaskTemplate['category'];
  dueAt: Date | null;
  isComplete: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
}

export interface Occupant {
  reference: string;
  displayName: string;
  initials: string;
  admittedAt: Date;
  treatmentDay: number;
  durationDays: number;
  plannedDischargeDate: string;
  daysUntilDischarge: number;
  substance: string;
  therapist: string;
  buddy: string;
  group: string;
  photoState: Fixture['photoState'];
  hasRestrictedAlert: boolean;
  familyMeetingEligibleFrom: Date;
  familyMeetingEligibleNow: boolean;
  tasks: readonly BoardTask[];
  overdueCount: number;
  dueTodayCount: number;
  completedCount: number;
  totalCount: number;
}

export interface BoardBed {
  label: string;
  room: string;
  shared: boolean;
  occupant: Occupant | null;
}

const initialsOf = (name: string): string =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

function buildOccupant(fixture: Fixture, now: Date): Occupant {
  const admittedAt = fromZonedDateString(fixture.admittedOn, TZ, {
    hour: fixture.admittedHour,
    minute: 0,
  });

  const plannedDischargeDate = calculatePlannedDischargeDate(
    admittedAt,
    { amount: fixture.durationDays, unit: 'days' },
    settings,
  );

  const completed = new Set(fixture.completed);
  const nowDate = new Date(now);

  const tasks: BoardTask[] = TASK_TEMPLATES.map((tpl) => {
    const dueAt = computeDueAt(tpl, {
      admittedAt,
      plannedDischargeDate,
      actualDischargeAt: null,
      settings,
    });
    const isComplete = completed.has(tpl.code);
    return {
      code: tpl.code,
      title: tpl.name,
      category: tpl.category,
      dueAt,
      isComplete,
      isOverdue: isOverdue(
        { dueAt, completedAt: isComplete ? admittedAt : null, status: isComplete ? 'completed' : 'not_started' },
        nowDate,
      ),
      isDueToday:
        !isComplete && dueAt !== null && calendarDaysBetween(nowDate, dueAt, TZ) === 0,
    };
  });

  const eligibility = assessEligibility(admittedAt, settings, nowDate);

  return {
    reference: fixture.reference,
    displayName: fixture.displayName,
    initials: initialsOf(fixture.displayName),
    admittedAt,
    // Day 1 is the admission day, matching the inclusive discharge rule.
    treatmentDay: calendarDaysBetween(admittedAt, nowDate, TZ) + 1,
    durationDays: fixture.durationDays,
    plannedDischargeDate,
    daysUntilDischarge: calendarDaysBetween(
      nowDate,
      fromZonedDateString(plannedDischargeDate, TZ, { hour: 12, minute: 0 }),
      TZ,
    ),
    substance: fixture.substance,
    therapist: fixture.therapist,
    buddy: fixture.buddy,
    group: fixture.group,
    photoState: fixture.photoState,
    hasRestrictedAlert: fixture.hasRestrictedAlert,
    familyMeetingEligibleFrom: eligibility.eligibleFrom,
    familyMeetingEligibleNow: eligibility.isEligibleNow,
    tasks,
    overdueCount: tasks.filter((t) => t.isOverdue).length,
    dueTodayCount: tasks.filter((t) => t.isDueToday).length,
    completedCount: tasks.filter((t) => t.isComplete).length,
    totalCount: tasks.length,
  };
}

export function buildBoard(now: Date = NOW): readonly BoardBed[] {
  const byBed = new Map(FIXTURES.map((f) => [f.bed, f]));
  return BED_LAYOUT.map(({ label, room, shared }) => {
    const fixture = byBed.get(label);
    return {
      label,
      room,
      shared,
      occupant: fixture ? buildOccupant(fixture, now) : null,
    };
  });
}

export interface BoardSummary {
  bedsTotal: number;
  bedsOccupied: number;
  bedsAvailable: number;
  occupancyPercent: number;
  dueToday: number;
  overdue: number;
  photoAttention: number;
  restrictedAlerts: number;
  dischargingWithin7Days: number;
  /**
   * Clients still in a bed whose planned discharge date has passed.
   *
   * Worth its own figure. On the whiteboard this condition is invisible: the duration column and
   * the discharge column disagree silently, and one client in the source file shows a 28-day
   * programme against a 57-day stay with nothing to indicate a plan ever changed.
   */
  pastPlannedDischarge: number;
}

export function summarise(board: readonly BoardBed[]): BoardSummary {
  const occupants = board.flatMap((b) => (b.occupant ? [b.occupant] : []));
  return {
    bedsTotal: board.length,
    bedsOccupied: occupants.length,
    bedsAvailable: board.length - occupants.length,
    occupancyPercent: Math.round((occupants.length / board.length) * 100),
    dueToday: occupants.reduce((n, o) => n + o.dueTodayCount, 0),
    overdue: occupants.reduce((n, o) => n + o.overdueCount, 0),
    photoAttention: occupants.filter((o) => o.photoState !== 'verified').length,
    restrictedAlerts: occupants.filter((o) => o.hasRestrictedAlert).length,
    dischargingWithin7Days: occupants.filter(
      (o) => o.daysUntilDischarge >= 0 && o.daysUntilDischarge <= 7,
    ).length,
    pastPlannedDischarge: occupants.filter((o) => o.daysUntilDischarge < 0).length,
  };
}
