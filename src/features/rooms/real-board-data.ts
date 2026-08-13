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
  DischargeRequestRow,
  ExtensionRequestRow,
  RoomAllocationRow,
  StaffAssignmentRow,
  SubstanceRow,
  TaskCompleterRow,
  TaskReopenRow,
} from '../../services/data-access.js';
import { concerns, roomBoard, roomsAndBeds } from '../../services/data-access.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { assessEligibility } from '../../domain/eligibility.js';
import { isOverdue } from '../../domain/tasks.js';
import { calendarDaysBetween, fromZonedDateString } from '../../domain/zoned-time.js';
import type {
  BoardBed,
  BoardSummary,
  BoardTask,
  DischargeRequestSummary,
  ExtensionRequestSummary,
  Occupant,
  TaskReopen,
} from './board-data.js';
import { summarise } from './board-data.js';

// TODO: read from `centres.timezone` once the room-board query fetches it. Every configured centre
// today is Europe/London, so this is a scoped simplification, not a guess dressed up as a fact.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;
const settings = PRIMROSE_LODGE_SETTINGS;

const initialsOf = (name: string): string =>
  name.split(/[\s.]+/).filter(Boolean).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();

// Clients admitted before migration 0038 had safeguarding text concatenated into allocation_reason
// as "Safeguarding/Risks: {text}\n\nNotes: {notes}". Split that back apart so the UI can route
// each piece to the right section without showing the raw prefixed string anywhere.
function parseLegacyReason(raw: string | null): { legacySafeguardingNote: string | null; admissionNotes: string | null } {
  if (!raw?.trim()) return { legacySafeguardingNote: null, admissionNotes: null };
  const match = raw.match(/^Safeguarding\/Risks:\s*([\s\S]+?)(?:\n\nNotes:\s*([\s\S]+))?$/);
  if (match) {
    return {
      legacySafeguardingNote: match[1]?.trim() || null,
      admissionNotes: match[2]?.trim() || null,
    };
  }
  return { legacySafeguardingNote: null, admissionNotes: raw.trim() || null };
}

function buildRealOccupant(
  admission: AdmissionRow,
  clientsById: Map<string, ClientRow>,
  staffByAdmission: Map<string, StaffAssignmentRow[]>,
  tasksByAdmission: Map<string, ClientTaskRow[]>,
  substancesById: Map<string, SubstanceRow>,
  photoUrlByClientId: Map<string, string>,
  completerNameById: Map<string, string>,
  reopensByTaskId: Map<string, TaskReopen[]>,
  noteRequiredByTemplateId: Map<string, boolean>,
  dischargeRequestByAdmission: Map<string, DischargeRequestRow>,
  extensionRequestByAdmission: Map<string, ExtensionRequestRow>,
  openConcernClientIds: Set<string>,
  admissionNotes: string | null,
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
  const keyworkerLabel = staff.find((s) => s.role_code === 'key_worker')?.display_label ?? null;
  const buddyLabel = staff.find((s) => s.role_code === 'buddy')?.display_label ?? '—';

  const rawTasks = tasksByAdmission.get(admission.id) ?? [];
  const tasks: BoardTask[] = rawTasks.map((t) => {
    const dueAt = t.due_at ? new Date(t.due_at) : null;
    const completedAt = t.completed_at ? new Date(t.completed_at) : null;
    const isComplete = t.status === 'completed';
    const isNotApplicable = t.status === 'not_applicable' || t.status === 'cancelled';
    return {
      // A real row, so this task can actually be completed — see BoardTask.id.
      id: t.id,
      code: t.code ?? '',
      title: t.title,
      category: t.category as BoardTask['category'],
      dueAt,
      // A 'done_no_date' import holds the snapshot timestamp in completed_at, not a real completion
      // moment — see BoardTask.completedAt. Withheld rather than shown as fact.
      completedAt: t.source_interpretation === 'done_no_date' ? null : completedAt,
      completedBy: t.completed_by ? (completerNameById.get(t.completed_by) ?? null) : null,
      reopens: reopensByTaskId.get(t.id) ?? [],
      requiresCompletionNote: t.template_id
        ? (noteRequiredByTemplateId.get(t.template_id) ?? false)
        : false,
      // Inert placeholder — see the file header. No UI component reads this field for real data.
      recorded: isComplete
        ? { kind: 'completed', on: completedAt ?? now }
        : isNotApplicable
          ? { kind: 'not_applicable', raw: '' }
          : { kind: 'nothing_recorded' },
      isComplete,
      isNotApplicable,
      notApplicableReason: isNotApplicable ? (t.not_applicable_reason ?? 'Not applicable.') : null,
      // Direct reuse of the tested domain function — a real client_task row already has exactly the
      // shape isOverdue expects.
      isOverdue: !isNotApplicable && isOverdue({ dueAt, completedAt, status: t.status as never }, now),
      isDueToday: !isComplete && !isNotApplicable && dueAt !== null && calendarDaysBetween(now, dueAt, TZ) === 0,
      hasDateChanges: t.reschedule_count > 0,
    };
  });

  const eligibility = assessEligibility(admittedAt, settings, now);
  const legacyParsed = parseLegacyReason(admissionNotes);
  // c.display_name is null when the caller holds clients.view_operational but not
  // clients.view_identity — the bed is still occupied and known, just not by name.
  const displayName = c.display_name ?? c.reference;

  const req = dischargeRequestByAdmission.get(admission.id);
  const dischargeRequest: DischargeRequestSummary | null = req
    ? {
        id: req.id,
        dischargeType: req.discharge_type,
        status: req.status,
        reason: req.reason,
        requestedBy: req.requested_by,
        approvalNotes: req.approval_notes,
        transferDestination: req.transfer_destination,
        transferTreatmentType: req.transfer_treatment_type,
        transferDurationDays: req.transfer_duration_days,
      }
    : null;

  const ext = extensionRequestByAdmission.get(admission.id);
  const extensionRequest: ExtensionRequestSummary | null = ext
    ? {
        id: ext.id,
        originalDischargeDate: ext.original_discharge_date,
        additionalDays: ext.additional_days,
        newDischargeDate: ext.new_discharge_date,
        reason: ext.reason,
        requestedBy: ext.requested_by,
      }
    : null;

  return {
    // A real row, so this admission can actually be discharged — see the doc comment on Occupant.
    admissionId: admission.id,
    clientId: admission.client_id,
    dischargeRequest,
    extensionRequest,
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
    keyworker: keyworkerLabel,
    buddy: buddyLabel,
    group: admission.treatment_group ?? '',
    peeps: admission.peep_required,
    photoState: photoUrlByClientId.has(admission.client_id) ? 'present' : 'missing',
    photoUrl: photoUrlByClientId.get(admission.client_id) ?? null,
    hasRestrictedAlert: admission.high_risk,
    hasOpenConcern: openConcernClientIds.has(admission.client_id),
    legacySafeguardingNote: legacyParsed.legacySafeguardingNote,
    // Prefer the proper DB column introduced in migration 0039 over the legacy allocation_reason field.
    admissionNotes: admission.admission_notes ?? legacyParsed.admissionNotes,
    admissionNotesUpdatedByName: admission.admission_notes_updated_by_name ?? null,
    admissionNotesUpdatedAt: admission.admission_notes_updated_at ?? null,
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
  const [rooms, beds, data, openConcernIds] = await Promise.all([
    roomsAndBeds.rooms(centreId),
    roomsAndBeds.beds(centreId),
    roomBoard.forCentre(centreId),
    concerns.openClientIds(centreId).catch(() => new Set<string>()),
  ]);

  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const clientsById = new Map(data.clients.map((c) => [c.client_id, c]));
  const substancesById = new Map(data.substances.map((s) => [s.id, s]));
  const noteRequiredByTemplateId = new Map(
    data.taskTemplates.map((t) => [t.id, t.requires_completion_note]),
  );
  // At most one row per admission in practice: the unique index in migration 0027 allows only one
  // 'pending' request at a time, and an 'approved' one is consumed the moment it is finalised.
  const dischargeRequestByAdmission = new Map(
    (data.dischargeRequests as DischargeRequestRow[]).map((r) => [r.admission_id, r]),
  );
  // At most one pending extension per admission (migration 0036 unique index).
  const extensionRequestByAdmission = new Map(
    (data.extensionRequests as ExtensionRequestRow[]).map((r) => [r.admission_id, r]),
  );
  const photoUrlByClientId = new Map<string, string>(
    (data.photos as ClientPhotoRow[])
      .filter((p) => p.signed_url !== null)
      .map((p) => [p.client_id, p.signed_url as string]),
  );
  const completerNameById = new Map<string, string>(
    (data.taskCompleters as TaskCompleterRow[]).map((u) => [u.user_id, u.display_name]),
  );
  // Already newest-first out of the RPC; grouping preserves that order per task.
  const reopensByTaskId = new Map<string, TaskReopen[]>();
  for (const r of data.taskReopens as TaskReopenRow[]) {
    const list = reopensByTaskId.get(r.task_id) ?? [];
    list.push({ at: new Date(r.occurred_at), by: r.actor_label, reason: r.reason });
    reopensByTaskId.set(r.task_id, list);
  }

  const admissionByBed = new Map<string, AdmissionRow>();
  const admissionNotesByBed = new Map<string, string | null>();
  for (const alloc of data.allocations as RoomAllocationRow[]) {
    const admission = data.admissions.find((a) => a.id === alloc.admission_id);
    if (admission) {
      admissionByBed.set(alloc.bed_id, admission);
      admissionNotesByBed.set(alloc.bed_id, alloc.allocation_reason);
    }
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
            photoUrlByClientId,
            completerNameById,
            reopensByTaskId,
            noteRequiredByTemplateId,
            dischargeRequestByAdmission,
            extensionRequestByAdmission,
            openConcernIds,
            admissionNotesByBed.get(bed.id) ?? null,
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
