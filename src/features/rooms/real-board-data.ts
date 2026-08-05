/**
 * The room board, built from real Supabase data.
 *
 * Everything in `board-data.ts` is either fictional (the demo occupants) or a frozen historical
 * snapshot (the pseudonymised 21 Jul 2026 board) — neither is a real database row, so admitting a
 * client through the real admission form has, until now, produced no visible change anywhere in the
 * app. This module closes that gap: it reads the actual `admissions`, `room_allocations`,
 * `staff_assignments` and `client_tasks` tables and assembles them into the exact `BoardBed` /
 * `Occupant` shape `board-data.ts` already exports — so `BedCard`, `BedList` and `DetailPanel` all
 * render this without a single change, and every due-date and overdue computation reuses the same
 * tested domain functions rather than a second copy of the logic.
 *
 * Three fields on `Occupant` exist only to describe a workbook import (`recorded`,
 * `calculatedDischargeDate`, `dischargeMismatchDays`) and are not read by any UI component — checked
 * by grep before assuming it. They are filled with inert placeholders here rather than left undefined,
 * because a real admission has no "recorded vs calculated" discrepancy to describe: there is exactly
 * one source of truth now, the database.
 *
 * Not yet wired in: the safeguarding/risk restricted-alert flag. Showing it for real would mean
 * calling `app.safeguarding_indicator` / `app.risk_indicator`, which — like `admit_client` before the
 * fix in migration 0024 — are not yet reachable from the browser without a `public` wrapper. No
 * safeguarding or risk records exist yet either, since the UI to create them has not been built. Both
 * gaps are real; wiring the flag now would be decoration with nothing behind it, so it stays `false`
 * until there is something for it to report.
 */

import type {
  AdmissionRow,
  ClientPhotoRow,
  ClientRow,
  ClientTaskRow,
  RoomAllocationRow,
  StaffAssignmentRow,
  SubstanceRow,
} from '../../services/data-access.js';
import { roomBoard, roomsAndBeds } from '../../services/data-access.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { assessEligibility } from '../../domain/eligibility.js';
import { isOverdue } from '../../domain/tasks.js';
import { calendarDaysBetween, fromZonedDateString } from '../../domain/zoned-time.js';
import type { BoardBed, BoardSummary, BoardTask, Occupant } from './board-data.js';
import { summarise } from './board-data.js';

// TODO: read from `centres.timezone` once the room-board query fetches it. Every configured centre
// today is Europe/London, so this is a scoped simplification, not a guess dressed up as a fact.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;
const settings = PRIMROSE_LODGE_SETTINGS;

const initialsOf = (name: string): string =>
  name.split(/[\s.]+/).filter(Boolean).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();

function buildRealOccupant(
  admission: AdmissionRow,
  clientsById: Map<string, ClientRow>,
  staffByAdmission: Map<string, StaffAssignmentRow[]>,
  tasksByAdmission: Map<string, ClientTaskRow[]>,
  substancesById: Map<string, SubstanceRow>,
  photographedClientIds: Set<string>,
  now: Date,
): Occupant | null {
  const c = clientsById.get(admission.client_id);
  // A missing row here means the caller can't even see this client exists — genuinely nothing to
  // render. Identity withheld (display_name null, migration 0025) is a *different* case, handled
  // below: the bed is still occupied and must still show as such.
  if (!c) return null;

  const admittedAt = new Date(admission.admitted_at);
  const durationDays =
    admission.planned_duration_unit === 'weeks' ? admission.planned_duration * 7 : admission.planned_duration;

  const staff = staffByAdmission.get(admission.id) ?? [];
  const therapistLabel = staff.find((s) => s.role_code === 'focal_therapist')?.display_label ?? null;
  const buddyLabel = staff.find((s) => s.role_code === 'buddy')?.display_label ?? '—';

  const rawTasks = tasksByAdmission.get(admission.id) ?? [];
  const tasks: BoardTask[] = rawTasks.map((t) => {
    const dueAt = t.due_at ? new Date(t.due_at) : null;
    const completedAt = t.completed_at ? new Date(t.completed_at) : null;
    const isComplete = t.status === 'completed';
    const isNotApplicable = t.status === 'not_applicable' || t.status === 'cancelled';
    return {
      code: t.code ?? '',
      title: t.title,
      category: t.category as BoardTask['category'],
      dueAt,
      // Inert placeholder — see the file header. No UI component reads this field for real data.
      recorded: isComplete
        ? { kind: 'completed', on: completedAt ?? now }
        : isNotApplicable
          ? { kind: 'not_applicable', raw: '' }
          : { kind: 'nothing_recorded' },
      isComplete,
      isNotApplicable,
      // Direct reuse of the tested domain function — a real client_task row already has exactly the
      // shape isOverdue expects.
      isOverdue: !isNotApplicable && isOverdue({ dueAt, completedAt, status: t.status as never }, now),
      isDueToday: !isComplete && !isNotApplicable && dueAt !== null && calendarDaysBetween(now, dueAt, TZ) === 0,
    };
  });

  const eligibility = assessEligibility(admittedAt, settings, now);
  // c.display_name is null when the caller holds clients.view_operational but not
  // clients.view_identity — the bed is still occupied and known, just not by name.
  const displayName = c.display_name ?? c.reference;

  return {
    reference: c.reference,
    displayName,
    initials: initialsOf(c.display_name ?? c.reference),
    admittedAt,
    treatmentDay: calendarDaysBetween(admittedAt, now, TZ) + 1,
    durationDays,
    plannedDischargeDate: admission.current_planned_discharge_date,
    // No recorded/calculated split for a real admission: one row, one source of truth.
    calculatedDischargeDate: admission.current_planned_discharge_date,
    dischargeMismatchDays: 0,
    daysUntilDischarge: calendarDaysBetween(
      now,
      fromZonedDateString(admission.current_planned_discharge_date, TZ, { hour: 12, minute: 0 }),
      TZ,
    ),
    substance: admission.primary_substance_id ? substancesById.get(admission.primary_substance_id)?.name ?? '' : '',
    therapist: therapistLabel,
    buddy: buddyLabel,
    group: admission.treatment_group ?? '',
    peeps: admission.peep_required,
    photoState: photographedClientIds.has(admission.client_id) ? 'present' : 'missing',
    // See file header: no safeguarding/risk data or reachable indicator RPC exists yet.
    hasRestrictedAlert: false,
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

export async function buildRealBoard(
  centreId: string,
  now: Date = new Date(),
): Promise<{ board: readonly BoardBed[]; summary: BoardSummary }> {
  const [rooms, beds, data] = await Promise.all([
    roomsAndBeds.rooms(centreId),
    roomsAndBeds.beds(centreId),
    roomBoard.forCentre(centreId),
  ]);

  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const clientsById = new Map(data.clients.map((c) => [c.client_id, c]));
  const substancesById = new Map(data.substances.map((s) => [s.id, s]));
  const photographedClientIds = new Set<string>(
    (data.photos as ClientPhotoRow[]).map((p) => p.client_id),
  );

  const admissionByBed = new Map<string, AdmissionRow>();
  for (const alloc of data.allocations as RoomAllocationRow[]) {
    const admission = data.admissions.find((a) => a.id === alloc.admission_id);
    if (admission) admissionByBed.set(alloc.bed_id, admission);
  }

  const staffByAdmission = new Map<string, StaffAssignmentRow[]>();
  for (const s of data.staffAssignments as StaffAssignmentRow[]) {
    const list = staffByAdmission.get(s.admission_id) ?? [];
    list.push(s);
    staffByAdmission.set(s.admission_id, list);
  }

  const tasksByAdmission = new Map<string, ClientTaskRow[]>();
  for (const t of data.tasks as ClientTaskRow[]) {
    const list = tasksByAdmission.get(t.admission_id) ?? [];
    list.push(t);
    tasksByAdmission.set(t.admission_id, list);
  }

  const board: BoardBed[] = [...beds]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((bed) => {
      const room = roomsById.get(bed.room_id);
      const admission = admissionByBed.get(bed.id);
      const occupant = admission
        ? buildRealOccupant(
            admission,
            clientsById,
            staffByAdmission,
            tasksByAdmission,
            substancesById,
            photographedClientIds,
            now,
          )
        : null;
      return {
        label: bed.label,
        room: room?.label ?? bed.label,
        shared: room?.room_type === 'shared',
        occupant,
      };
    });

  return { board, summary: summarise(board) };
}
