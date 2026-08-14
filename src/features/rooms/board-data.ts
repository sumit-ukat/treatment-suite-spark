/**
 * Primrose Lodge — the real board, pseudonymised.
 *
 * REAL, taken from the source whiteboard as saved 2026-07-21 13:49:
 *   which beds were occupied · admission dates · treatment durations · planned discharge dates ·
 *   treatment group · PEEPs flag · primary substance · every task cell exactly as recorded ·
 *   which clients shared a therapist, buddy or doctor.
 *
 * PSEUDONYMISED, and never taken from the workbook:
 *   client names and references · staff names.
 *
 * Why the split. This module is compiled into the browser bundle, and the bundle is served from a
 * public URL with no login in front of it — a fact confirmed by downloading it. Anything written
 * here is published to anyone who asks. Operational shape carries the value for a demo; names carry
 * the risk, and they carry it irreversibly. So the shape is real and the people are invented.
 *
 * Staff pseudonyms preserve the real assignment *pattern*: where two clients shared a therapist in
 * the workbook, they share one here. That matters, because workload distribution is one of the
 * things the board is meant to reveal.
 *
 * Once the room board reads from Supabase behind the login, real names belong there — in a database
 * with RLS, not in a JavaScript file.
 */

import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { calculatePlannedDischargeDate } from '../../domain/discharge.js';
import { assessEligibility } from '../../domain/eligibility.js';
import { computeDueAt, isOverdue, type TaskTemplate } from '../../domain/tasks.js';
import { calendarDaysBetween, daysLeftInWeek, fromZonedDateString } from '../../domain/zoned-time.js';

const settings = PRIMROSE_LODGE_SETTINGS;
const TZ = settings.timezone;

/**
 * The board is read as at the workbook's last save. Anchoring here rather than "today" is what makes
 * the snapshot coherent: discharge dates sit in the future where they did, and overdue means what it
 * meant on the day. Read against today's date the same file shows five clients whose discharge has
 * already passed — which is staleness, not a process failure.
 */
export const NOW = fromZonedDateString('2026-07-21', TZ, { hour: 13, minute: 49 });

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

/** Task templates, mapped one-to-one onto the whiteboard's action columns. */
export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  { code: 'family_contact_24h', name: '24-hour family contact', category: 'family_contact', dueBasis: 'admission', dueOffset: 24, dueOffsetUnit: 'hours', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 1 },
  { code: 'family_contact_week_1', name: 'Week 1 family contact', category: 'family_contact', dueBasis: 'admission', dueOffset: 1, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 1 },
  { code: 'family_contact_week_2', name: 'Week 2 family contact', category: 'family_contact', dueBasis: 'admission', dueOffset: 2, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 1 },
  { code: 'satisfaction_survey_7day', name: '7-day satisfaction survey', category: 'survey', dueBasis: 'admission', dueOffset: 7, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 1 },
  { code: 'life_story', name: 'Life story / surrender', category: 'milestone', dueBasis: 'admission', dueOffset: 10, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'step_1', name: 'Step 1', category: 'milestone', dueBasis: 'admission', dueOffset: 12, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'step_2', name: 'Step 2', category: 'milestone', dueBasis: 'admission', dueOffset: 18, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'step_3', name: 'Step 3', category: 'milestone', dueBasis: 'admission', dueOffset: 24, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'ccp', name: 'CCP', category: 'milestone', dueBasis: 'admission', dueOffset: 14, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_intro', name: 'Intro CP/121', category: 'session', dueBasis: 'admission', dueOffset: 0, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_week_1', name: 'Week 1 CP/121', category: 'session', dueBasis: 'admission', dueOffset: 1, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_week_2', name: 'Week 2 CP/121', category: 'session', dueBasis: 'admission', dueOffset: 2, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_week_3', name: 'Week 3 CP/121', category: 'session', dueBasis: 'admission', dueOffset: 3, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'session_week_4', name: 'Week 4 CP/121', category: 'session', dueBasis: 'admission', dueOffset: 4, dueOffsetUnit: 'weeks', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 2 },
  { code: 'gp_summary', name: 'GP summary', category: 'medical', dueBasis: 'admission', dueOffset: 5, dueOffsetUnit: 'days', isRequired: true, rescheduleOnDischargeChange: false, visibilityLevel: 3 },
  { code: 'family_contact_pre_discharge', name: 'Family contact 24h before leaving', category: 'family_contact', dueBasis: 'planned_discharge', dueOffset: -24, dueOffsetUnit: 'hours', isRequired: true, rescheduleOnDischargeChange: true, visibilityLevel: 1 },
];

/**
 * A cell exactly as the whiteboard holds it.
 *
 *   'YYYY-MM-DD'  a date
 *   'TRUE'        the tick box, with no date
 *   'X' / 'x'     the programme does not reach that week — not applicable (Q2, answered)
 *   ''            blank
 */
type Cell = string;

interface RealRow {
  bed: string;
  admitted: string;
  durationDays: number;
  /** As recorded in the workbook, which does not always equal admission + duration - 1. */
  recordedDischarge: string;
  group: string;
  peeps: boolean;
  substance: string;
  therapistIdx: number | null;
  buddyIdx: number;
  doctorIdx: number | null;
  hasSafeguardingNote: boolean;
  cells: Record<string, Cell>;
}

/** Pseudonyms. Index positions preserve the real sharing pattern; the names are invented. */
const THERAPISTS = ['R. Ellery', 'S. Brandt', 'L. Vance', 'M. Achebe'];
// Buddies are centre STAFF (Q41, answered), so these are staff pseudonyms - distinct from the
// client names below. The earlier overlap was a coincidence of first names, not a peer link.
const BUDDIES = ['T. Nkemi', 'G. Halloran', 'B. Ozturk', 'F. Adeyemi', 'N. Kowalski', 'V. Sandhu'];
const CLIENT_NAMES: Record<string, string> = {
  '1': 'A. Whitfield',
  '3': 'M. Oyelaran',
  '4': 'J. Calloway',
  '5': 'D. Fenwick',
  '7': 'K. Amankwah',
  '10': 'P. Ridley',
  '15': 'H. Duignan',
  '16': 'C. Marchetti',
};
const CLIENT_REFS: Record<string, string> = {
  '1': 'PL-1042', '3': 'PL-1017', '4': 'PL-1051', '5': 'PL-1008',
  '7': 'PL-1053', '10': 'PL-1039', '15': 'PL-1024', '16': 'PL-1047',
};

/** Eight occupied beds, exactly as the whiteboard recorded them. */
const REAL_ROWS: readonly RealRow[] = [
  {
    bed: '1', admitted: '2026-07-16', durationDays: 28, recordedDischarge: '2026-08-12',
    group: 'A', peeps: false, substance: 'Alcohol',
    therapistIdx: 0, buddyIdx: 0, doctorIdx: 0, hasSafeguardingNote: true,
    cells: {
      family_contact_24h: 'TRUE', family_contact_week_1: '2026-07-23',
      family_contact_week_2: '2026-07-30', family_contact_pre_discharge: '2026-08-11',
      satisfaction_survey_7day: '2026-07-23', life_story: '2026-07-19',
      step_1: '2026-07-22', step_2: '2026-07-25', step_3: '', ccp: '2026-07-28',
      session_intro: '2026-07-17', session_week_1: '2026-07-21', session_week_2: '2026-07-28',
      session_week_3: 'X', session_week_4: 'X', gp_summary: 'TRUE',
    },
  },
  {
    bed: '3', admitted: '2026-06-02', durationDays: 28, recordedDischarge: '2026-07-29',
    group: 'B', peeps: false, substance: 'Alcohol',
    therapistIdx: 1, buddyIdx: 1, doctorIdx: 0, hasSafeguardingNote: true,
    cells: {
      family_contact_24h: 'TRUE', family_contact_week_1: 'TRUE', family_contact_week_2: 'TRUE',
      family_contact_pre_discharge: 'TRUE', satisfaction_survey_7day: 'TRUE', life_story: 'TRUE',
      step_1: 'TRUE', step_2: 'TRUE', step_3: '2026-07-20', ccp: '2026-07-23',
      session_intro: '2026-07-03', session_week_1: '2026-07-08', session_week_2: '2026-07-14',
      session_week_3: '2026-07-21', session_week_4: '2026-07-27', gp_summary: 'TRUE',
    },
  },
  {
    bed: '4', admitted: '2026-07-09', durationDays: 28, recordedDischarge: '2026-08-05',
    group: 'A', peeps: true, substance: 'Alcohol',
    therapistIdx: 2, buddyIdx: 2, doctorIdx: null, hasSafeguardingNote: true,
    cells: {
      family_contact_24h: 'TRUE', family_contact_week_1: 'TRUE',
      family_contact_week_2: '2026-07-23', family_contact_pre_discharge: '2026-08-03',
      satisfaction_survey_7day: '2026-07-17', life_story: 'TRUE',
      step_1: '2026-07-20', step_2: '2026-07-25', step_3: '2026-08-01',
      ccp: 'X', // recorded as "3//8" — a malformed date, not a status
      session_intro: '2026-07-10', session_week_1: '2026-07-16', session_week_2: '2026-07-22',
      session_week_3: '2026-07-29', session_week_4: '2026-08-04', gp_summary: 'TRUE',
    },
  },
  {
    bed: '5', admitted: '2026-07-03', durationDays: 28, recordedDischarge: '2026-07-30',
    group: 'A', peeps: false, substance: 'Alcohol',
    therapistIdx: 2, buddyIdx: 3, doctorIdx: 0, hasSafeguardingNote: true,
    cells: {
      family_contact_24h: 'TRUE', family_contact_week_1: 'TRUE', family_contact_week_2: 'TRUE',
      family_contact_pre_discharge: '2026-07-29', satisfaction_survey_7day: 'TRUE',
      life_story: 'TRUE', step_1: '2026-07-13', step_2: '2026-07-16', step_3: '2026-07-20',
      ccp: '2026-07-23', session_intro: '2026-07-04', session_week_1: '2026-07-08',
      session_week_2: '2026-07-15', session_week_3: '2026-07-22', session_week_4: '2026-07-27',
      gp_summary: 'TRUE',
    },
  },
  {
    bed: '7', admitted: '2026-06-26', durationDays: 28, recordedDischarge: '2026-07-22',
    group: 'A', peeps: false, substance: 'Cocaine',
    therapistIdx: 3, buddyIdx: 4, doctorIdx: 0, hasSafeguardingNote: true,
    cells: {
      family_contact_24h: 'TRUE', family_contact_week_1: 'TRUE', family_contact_week_2: 'TRUE',
      family_contact_pre_discharge: 'TRUE', satisfaction_survey_7day: 'TRUE', life_story: 'TRUE',
      step_1: 'TRUE', step_2: 'TRUE', step_3: 'TRUE', ccp: 'TRUE',
      session_intro: '2026-06-26', session_week_1: '2026-06-30', session_week_2: '2026-07-07',
      session_week_3: '2026-07-13', session_week_4: '2026-07-17', gp_summary: 'TRUE',
    },
  },
  {
    // No focal therapist and no treatment group recorded, exactly as in the source.
    bed: '10', admitted: '2026-07-18', durationDays: 10, recordedDischarge: '2026-07-27',
    group: '', peeps: false, substance: 'Alcohol',
    therapistIdx: null, buddyIdx: 0, doctorIdx: 1, hasSafeguardingNote: true,
    cells: {
      family_contact_24h: 'TRUE', family_contact_week_1: '2026-07-25', family_contact_week_2: 'x',
      family_contact_pre_discharge: '2026-07-26', satisfaction_survey_7day: '2026-07-25',
      life_story: '2026-07-20', step_1: '2026-07-23', step_2: 'x', step_3: 'x',
      ccp: '2026-07-25', session_intro: '2026-07-19', session_week_1: '2026-07-24',
      session_week_2: 'x', session_week_3: 'x', session_week_4: 'x', gp_summary: 'TRUE',
    },
  },
  {
    bed: '15', admitted: '2026-06-28', durationDays: 28, recordedDischarge: '2026-07-25',
    group: 'A', peeps: false, substance: 'Alcohol',
    therapistIdx: 1, buddyIdx: 5, doctorIdx: 1, hasSafeguardingNote: true,
    cells: {
      family_contact_24h: 'TRUE', family_contact_week_1: 'TRUE', family_contact_week_2: 'TRUE',
      family_contact_pre_discharge: '2026-07-24', satisfaction_survey_7day: 'TRUE',
      life_story: 'TRUE', step_1: 'TRUE', step_2: 'TRUE', step_3: '2026-07-14',
      ccp: '2026-07-20', session_intro: '2026-06-29', session_week_1: '2026-06-30',
      session_week_2: '2026-07-07', session_week_3: '2026-07-14', session_week_4: '2026-07-21',
      gp_summary: 'TRUE',
    },
  },
  {
    bed: '16', admitted: '2026-07-11', durationDays: 28, recordedDischarge: '2026-08-07',
    group: 'A', peeps: false, substance: 'Alcohol',
    therapistIdx: 3, buddyIdx: 0, doctorIdx: 1, hasSafeguardingNote: true,
    cells: {
      family_contact_24h: 'TRUE', family_contact_week_1: 'TRUE',
      family_contact_week_2: '2026-07-28', family_contact_pre_discharge: '2026-08-06',
      satisfaction_survey_7day: '2026-07-17', life_story: 'TRUE', step_1: 'TRUE',
      step_2: '2026-07-26', step_3: '2026-08-02', ccp: '2026-08-05',
      session_intro: '2026-07-13', session_week_1: '2026-07-16', session_week_2: '2026-07-22',
      session_week_3: '2026-07-29', session_week_4: '2026-08-05', gp_summary: 'TRUE',
    },
  },
];

/** How a whiteboard cell was interpreted. Kept on the task so the reading stays inspectable. */
export type RecordedState =
  | { kind: 'completed'; on: Date }
  | { kind: 'scheduled'; on: Date }
  | { kind: 'done_no_date' }
  | { kind: 'not_applicable'; raw: string }
  | { kind: 'nothing_recorded' };

/**
 * Interpret one cell against the snapshot date.
 *
 * A date in the past reads as done; a date in the future reads as booked. That is an inference, not
 * a fact the workbook states — one cell cannot say both when a thing was due and when it was done,
 * which is the central defect of the format and the reason this product separates the two.
 *
 * `X` means the programme does not reach that week — confirmed 2026-08-04, and checked against the
 * data: seven of the eight X marks are tasks whose deadline falls after that client's discharge
 * date. So it is **not applicable**, which is a different thing from outstanding and different again
 * from unknown. The eighth (bed 1, week 3, due six days before discharge) does not fit the rule and
 * is flagged rather than forced.
 */
function interpret(cell: Cell, now: Date): RecordedState {
  if (cell === '') return { kind: 'nothing_recorded' };
  if (cell === 'TRUE') return { kind: 'done_no_date' };
  if (cell === 'X' || cell === 'x') return { kind: 'not_applicable', raw: cell };
  const at = fromZonedDateString(cell, TZ, { hour: 12, minute: 0 });
  return at.getTime() <= now.getTime() ? { kind: 'completed', on: at } : { kind: 'scheduled', on: at };
}

/** One recorded reopen, reconstructed from audit history — see migration 0034. */
export interface TaskReopen {
  at: Date;
  /** Display name, falling back to the email captured on the audit event. Null only if neither exists. */
  by: string | null;
  /** Required by `app.reopen_client_task`, so in practice always present. */
  reason: string | null;
}

export interface BoardTask {
  /**
   * The `client_tasks` row id, when this task is a real database row. Null for the fictional and
   * frozen-snapshot boards in this file, which have no row behind them — and that null is what makes
   * them un-completable in the UI rather than needing a separate read-only flag.
   */
  id: string | null;
  code: string;
  title: string;
  category: TaskTemplate['category'];
  dueAt: Date | null;
  /**
   * When it was completed — but only when that is a real recorded moment. Null for an imported task
   * whose whiteboard cell said merely "TRUE": the database stores the import snapshot timestamp there
   * so the row is well-formed, and showing that as a completion time would invent a fact the
   * whiteboard never held. `isComplete` is still true in that case; the date simply is not known.
   */
  completedAt: Date | null;
  /** Who completed it, when known. Null for every imported task — the whiteboard recorded that work
   * was done, never by whom — and null when the caller cannot resolve the name. */
  completedBy: string | null;
  /**
   * Every time this task was reopened, newest first. Reopening clears the completion columns off the
   * row (migration 0026), so without this a previously-completed task is indistinguishable from one
   * never touched — the reason someone gave for undoing it would be invisible exactly where it
   * matters. Always empty on the fictional boards, which have no audit history behind them.
   */
  reopens: readonly TaskReopen[];
  recorded: RecordedState;
  isComplete: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  isNotApplicable: boolean;
  /** Why this task doesn't apply — shown wherever `isNotApplicable` is true, so that state never has
   * to be inferred from the absence of a due date or a completion. Null whenever isNotApplicable is
   * false. */
  notApplicableReason: string | null;
  /** From the task template. The server enforces this too; the UI uses it to ask for the note up front. */
  requiresCompletionNote: boolean;
  /** True when the due date has been moved at least once via the reschedule_task RPC. Always false on fictional boards. */
  hasDateChanges: boolean;
}

/** Current state of a non-routine discharge request. See migration 0027 — 'rejected'/'finalised' are not "current" and never appear here. */
export interface DischargeRequestSummary {
  id: string;
  dischargeType: 'early' | 'transfer' | 'other';
  status: 'pending' | 'approved';
  reason: string;
  requestedBy: string | null;
  approvalNotes: string | null;
  transferDestination: string | null;
  transferTreatmentType: string | null;
  transferDurationDays: number | null;
}

/** @deprecated — was used for the two-step approval flow removed in migration 0043. */
export interface ExtensionRequestSummary {
  id: string;
  originalDischargeDate: string;
  additionalDays: number;
  newDischargeDate: string;
  reason: string;
  requestedBy: string | null;
}

export interface Occupant {
  /** The `admissions` row id, when real — see BoardTask.id for why this is null on the fictional boards. */
  admissionId: string | null;
  /** The `clients` row id, when real — null on the fictional boards, same reasoning as admissionId.
   * Needed to upload a photo, since `client_photos` is keyed by client rather than by admission. */
  clientId: string | null;
  /** Null unless a non-routine discharge is pending approval or approved and awaiting finalisation. */
  dischargeRequest: DischargeRequestSummary | null;
  /** True when one or more approved stay extensions exist for this admission (migration 0043). */
  isExtendedStay: boolean;
  /** Total additional days across all approved extensions, or null if none. */
  extensionDays: number | null;
  /** The original planned discharge date before any extensions, for display (strikethrough). Null if no extensions. */
  originalDischargeDate: string | null;
  reference: string;
  displayName: string;
  initials: string;
  admittedAt: Date;
  treatmentDay: number;
  durationDays: number;
  plannedDischargeDate: string;
  /** What the rule gives, where it differs from what was written down. */
  calculatedDischargeDate: string;
  dischargeMismatchDays: number;
  daysUntilDischarge: number;
  substance: string;
  therapist: string | null;
  /** `key_worker` is a valid staff_assignments role_code (same table as therapist/buddy) that no UI
   * component surfaced until now. Null on the fictional boards — board-data.ts's THERAPISTS/BUDDIES
   * lists have no keyworker concept to draw from. */
  keyworker: string | null;
  buddy: string;
  group: string;
  peeps: boolean;
  photoState: 'present' | 'missing';
  /** A signed, time-limited URL for the actual photograph, when one exists — null whenever photoState
   * is 'missing', and always null on the fictional boards (see clientId's doc comment). */
  photoUrl: string | null;
  hasRestrictedAlert: boolean;
  hasOpenConcern: boolean;
  /** Safeguarding text extracted from old-format allocation_reason — shown in the concerns banner
   * when no client_concerns rows exist yet (clients admitted before migration 0038). Null for all
   * fictional boards and for any client that has real concern rows. */
  legacySafeguardingNote: string | null;
  admissionNotes: string | null;
  admissionNotesUpdatedByName: string | null;
  admissionNotesUpdatedAt: string | null;
  familyMeetingEligibleFrom: Date;
  familyMeetingEligibleNow: boolean;
  tasks: readonly BoardTask[];
  overdueCount: number;
  dueTodayCount: number;
  completedCount: number;
  notApplicableCount: number;
  totalCount: number;
}

export interface BoardBed {
  label: string;
  room: string;
  shared: boolean;
  occupant: Occupant | null;
}

const initialsOf = (name: string): string =>
  name.split(/[\s.]+/).filter(Boolean).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();

function buildOccupant(row: RealRow, now: Date): Occupant {
  const admittedAt = fromZonedDateString(row.admitted, TZ, { hour: 12, minute: 0 });
  const calculated = calculatePlannedDischargeDate(
    admittedAt, { amount: row.durationDays, unit: 'days' }, settings,
  );
  const msPerDay = 86_400_000;
  const mismatch = Math.round(
    (Date.parse(`${row.recordedDischarge}T00:00:00Z`) - Date.parse(`${calculated}T00:00:00Z`)) / msPerDay,
  );

  const tasks: BoardTask[] = TASK_TEMPLATES.map((tpl) => {
    const dueAt = computeDueAt(tpl, {
      admittedAt,
      // The recorded date wins over the calculated one: it is what staff actually planned to.
      plannedDischargeDate: row.recordedDischarge,
      actualDischargeAt: null,
      settings,
    });
    const recorded = interpret(row.cells[tpl.code] ?? '', now);
    const isComplete = recorded.kind === 'completed' || recorded.kind === 'done_no_date';
    const isNotApplicable = recorded.kind === 'not_applicable';
    return {
      // No database row behind this board — see BoardTask.id.
      id: null,
      code: tpl.code,
      title: tpl.name,
      category: tpl.category,
      dueAt,
      // 'completed' carries a real date off the whiteboard; 'done_no_date' is a bare TRUE with none.
      completedAt: recorded.kind === 'completed' ? recorded.on : null,
      // The whiteboard has no column for who did the work, and no audit history behind it.
      completedBy: null,
      reopens: [],
      recorded,
      isComplete,
      isNotApplicable,
      notApplicableReason: isNotApplicable
        ? 'Not applicable — the planned programme ends before this task falls due.'
        : null,
      // Irrelevant here: with id null nothing on this board can be completed anyway.
      requiresCompletionNote: false,
      hasDateChanges: false,
      // A not-applicable task is never overdue. The programme does not reach it, so there is no
      // work to be late for — counting it would manufacture a failure out of a shorter stay.
      isOverdue:
        !isNotApplicable &&
        isOverdue(
          { dueAt, completedAt: isComplete ? admittedAt : null, status: isComplete ? 'completed' : 'not_started' },
          now,
        ),
      isDueToday: !isComplete && !isNotApplicable && dueAt !== null && calendarDaysBetween(now, dueAt, TZ) === 0,
    };
  });

  const eligibility = assessEligibility(admittedAt, settings, now);

  return {
    // No database row behind this board — see admissionId's doc comment.
    admissionId: null,
    clientId: null,
    dischargeRequest: null,
    isExtendedStay: false,
    extensionDays: null,
    originalDischargeDate: null,
    reference: CLIENT_REFS[row.bed] ?? `PL-${row.bed}`,
    displayName: CLIENT_NAMES[row.bed] ?? `Client ${row.bed}`,
    initials: initialsOf(CLIENT_NAMES[row.bed] ?? `C ${row.bed}`),
    admittedAt,
    treatmentDay: calendarDaysBetween(admittedAt, now, TZ) + 1,
    durationDays: row.durationDays,
    plannedDischargeDate: row.recordedDischarge,
    calculatedDischargeDate: calculated,
    dischargeMismatchDays: mismatch,
    daysUntilDischarge: calendarDaysBetween(
      now, fromZonedDateString(row.recordedDischarge, TZ, { hour: 12, minute: 0 }), TZ,
    ),
    substance: row.substance,
    therapist: row.therapistIdx === null ? null : (THERAPISTS[row.therapistIdx] ?? null),
    keyworker: null,
    buddy: BUDDIES[row.buddyIdx] ?? '—',
    group: row.group,
    peeps: row.peeps,
    // The workbook holds eight photographs but no verification state — it has no concept of one.
    // Every client therefore starts unverified, which is the honest import outcome.
    // Verification is not required (Q43, answered): photographs are taken at admission and that is
    // that. All eight clients have one in the source workbook, so "present" is the honest state —
    // though the images themselves are not imported, since attaching the wrong photo to the wrong
    // client is the one import error that matters most.
    photoState: 'present',
    // No real image was ever imported for these — see the comment above. photoState 'present' with
    // photoUrl null renders the same checkmark-only badge it always has; PhotoBadge falls back to that
    // whenever there is nothing to actually show.
    photoUrl: null,
    hasRestrictedAlert: row.hasSafeguardingNote,
    hasOpenConcern: false,
    legacySafeguardingNote: null,
    admissionNotes: null,
    admissionNotesUpdatedByName: null,
    admissionNotesUpdatedAt: null,
    familyMeetingEligibleFrom: eligibility.eligibleFrom,
    familyMeetingEligibleNow: eligibility.isEligibleNow,
    tasks,
    overdueCount: tasks.filter((t) => t.isOverdue).length,
    dueTodayCount: tasks.filter((t) => t.isDueToday).length,
    completedCount: tasks.filter((t) => t.isComplete).length,
    notApplicableCount: tasks.filter((t) => t.isNotApplicable).length,
    totalCount: tasks.length,
  };
}

export function buildBoard(now: Date = NOW): readonly BoardBed[] {
  const byBed = new Map(REAL_ROWS.map((r) => [r.bed, r]));
  return BED_LAYOUT.map(({ label, room, shared }) => {
    const row = byBed.get(label);
    return { label, room, shared, occupant: row ? buildOccupant(row, now) : null };
  });
}

export interface BoardSummary {
  bedsTotal: number;
  bedsOccupied: number;
  bedsAvailable: number;
  occupancyPercent: number;
  dueToday: number;
  overdue: number;
  notApplicable: number;
  photoAttention: number;
  restrictedAlerts: number;
  /** Discharges planned between today and Sunday of this calendar week — not a rolling seven days.
   * See `daysLeftInWeek`. */
  dischargingThisWeek: number;
  pastPlannedDischarge: number;
  missingTherapist: number;
  dischargeMismatches: number;
}

export function summarise(board: readonly BoardBed[], now: Date = new Date()): BoardSummary {
  const occupants = board.flatMap((b) => (b.occupant ? [b.occupant] : []));
  const toEndOfWeek = daysLeftInWeek(now, TZ);
  return {
    bedsTotal: board.length,
    bedsOccupied: occupants.length,
    bedsAvailable: board.length - occupants.length,
    occupancyPercent: Math.round((occupants.length / board.length) * 100),
    dueToday: occupants.reduce((n, o) => n + o.dueTodayCount, 0),
    overdue: occupants.reduce((n, o) => n + o.overdueCount, 0),
    notApplicable: occupants.reduce((n, o) => n + o.notApplicableCount, 0),
    photoAttention: occupants.filter((o) => o.photoState === 'missing').length,
    restrictedAlerts: occupants.filter((o) => o.hasRestrictedAlert).length,
    dischargingThisWeek: occupants.filter(
      (o) => o.daysUntilDischarge >= 0 && o.daysUntilDischarge <= toEndOfWeek,
    ).length,
    pastPlannedDischarge: occupants.filter((o) => o.daysUntilDischarge < 0).length,
    missingTherapist: occupants.filter((o) => o.therapist === null).length,
    dischargeMismatches: occupants.filter((o) => Math.abs(o.dischargeMismatchDays) > 0).length,
  };
}
