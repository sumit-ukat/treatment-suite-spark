/**
 * Task due-date computation, status derivation and recalculation.
 *
 * BR-11 `dueAt` and `completedAt` are separate; `overdue` is derived, never stored
 * BR-12 blank / cancelled / not-applicable are distinct states, and the latter two need reasons
 * BR-13 tasks are generated from templates at admission
 * BR-10 a discharge-date change recalculates only open, discharge-based tasks
 *
 * The whole file exists because the source spreadsheet holds one value per action. It cannot say
 * "due Monday, done Wednesday", so lateness is unmeasurable — which makes the central governance
 * question ("were required actions completed within the expected timescales?") unanswerable from it.
 */

import type { CentreSettings } from './centre-settings.js';
import type { OffsetUnit } from './zoned-time.js';
import { addOffset, fromZonedDateString } from './zoned-time.js';

export type TaskCategory =
  | 'family_contact'
  | 'milestone'
  | 'session'
  | 'medical'
  | 'admin'
  | 'discharge'
  | 'survey';

export type DueBasis =
  | 'admission'
  | 'planned_discharge'
  | 'actual_discharge'
  | 'prior_task_completion'
  | 'manual';

export type TaskStatus =
  | 'not_started'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'cancelled'
  | 'not_applicable'
  | 'awaiting_review';

/** Statuses in which a task no longer needs doing. Used by overdue and recalculation logic. */
const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'completed',
  'cancelled',
  'not_applicable',
]);

export interface TaskTemplate {
  code: string;
  name: string;
  category: TaskCategory;
  dueBasis: DueBasis;
  dueOffset: number;
  dueOffsetUnit: OffsetUnit;
  isRequired: boolean;
  /** Whether this task's deadline follows a change to the planned discharge date. */
  rescheduleOnDischargeChange: boolean;
  priorTaskCode?: string;
  visibilityLevel: 1 | 2 | 3 | 4;
}

export interface ClientTask {
  id: string;
  templateCode: string | null;
  category: TaskCategory;
  title: string;
  status: TaskStatus;
  dueAt: Date | null;
  completedAt: Date | null;
  assignedUserId: string | null;
  responsibleRoleCode: string | null;
  cancellationReason: string | null;
  notApplicableReason: string | null;
}

export interface AdmissionContext {
  admittedAt: Date;
  plannedDischargeDate: string | null;
  actualDischargeAt: Date | null;
  settings: CentreSettings;
  /** Completion instants of already-computed tasks, keyed by template code. */
  completedTaskTimes?: ReadonlyMap<string, Date>;
}

/**
 * Compute a task's due instant from its template.
 *
 * Returns `null` where no deadline can be derived — a `manual` basis, or a basis whose anchor does
 * not exist yet (no discharge date, prior task not yet complete). A null due date is a legitimate,
 * visible state; it is not an error and must not be back-filled with a guess.
 */
export function computeDueAt(template: TaskTemplate, ctx: AdmissionContext): Date | null {
  const { settings } = ctx;
  const { hour, minute } = settings.defaultDeadlineTimeOfDay;

  switch (template.dueBasis) {
    case 'admission':
      return addOffset(ctx.admittedAt, template.dueOffset, template.dueOffsetUnit, settings.timezone);

    case 'planned_discharge': {
      if (!ctx.plannedDischargeDate) return null;
      const anchor = fromZonedDateString(ctx.plannedDischargeDate, settings.timezone, { hour, minute });
      return addOffset(anchor, template.dueOffset, template.dueOffsetUnit, settings.timezone);
    }

    case 'actual_discharge': {
      if (!ctx.actualDischargeAt) return null;
      return addOffset(ctx.actualDischargeAt, template.dueOffset, template.dueOffsetUnit, settings.timezone);
    }

    case 'prior_task_completion': {
      if (!template.priorTaskCode) return null;
      const priorCompletedAt = ctx.completedTaskTimes?.get(template.priorTaskCode);
      if (!priorCompletedAt) return null;
      return addOffset(priorCompletedAt, template.dueOffset, template.dueOffsetUnit, settings.timezone);
    }

    case 'manual':
      return null;
  }
}

/**
 * Is this task overdue *now*?
 *
 * Derived on read. Deliberately not a stored status: a stored flag needs a job to keep it true and
 * is wrong between runs — the same staleness that makes a printed whiteboard misleading.
 *
 * The boundary is exclusive: a task due at exactly `now` is not yet overdue.
 */
export function isOverdue(task: Pick<ClientTask, 'dueAt' | 'completedAt' | 'status'>, now: Date): boolean {
  if (task.dueAt === null) return false;
  if (task.completedAt !== null) return false;
  if (TERMINAL_STATUSES.has(task.status)) return false;
  return task.dueAt.getTime() < now.getTime();
}

/** Generate the task set for a new admission. BR-13. */
export function generateTasksForAdmission(
  templates: readonly TaskTemplate[],
  ctx: AdmissionContext,
): Array<Pick<ClientTask, 'templateCode' | 'category' | 'title' | 'status' | 'dueAt'>> {
  return templates.map((template) => ({
    templateCode: template.code,
    category: template.category,
    title: template.name,
    status: 'not_started' as const,
    dueAt: computeDueAt(template, ctx),
  }));
}

export interface RecalculationResult {
  taskId: string;
  previousDueAt: Date | null;
  newDueAt: Date | null;
}

/**
 * Recalculate open, discharge-based deadlines after the planned discharge date moves. BR-10.
 *
 * Completed tasks are never touched. Their due date is the evidence of whether that piece of work
 * was on time; rewriting it would falsify the record of a past deadline. Cancelled and
 * not-applicable tasks are skipped for the same reason.
 *
 * This is the failure the workbook demonstrates directly: its `24h prior to leaving` values were
 * computed by hand, and when one client's discharge moved by 29 days the deadline stayed put.
 */
export function recalculateOpenTasks(
  tasks: readonly ClientTask[],
  templatesByCode: ReadonlyMap<string, TaskTemplate>,
  ctx: AdmissionContext,
): RecalculationResult[] {
  const results: RecalculationResult[] = [];

  for (const task of tasks) {
    if (task.completedAt !== null || TERMINAL_STATUSES.has(task.status)) continue;
    if (task.templateCode === null) continue;

    const template = templatesByCode.get(task.templateCode);
    if (!template) continue;
    if (template.dueBasis !== 'planned_discharge') continue;
    if (!template.rescheduleOnDischargeChange) continue;

    const newDueAt = computeDueAt(template, ctx);
    if (newDueAt?.getTime() === task.dueAt?.getTime()) continue;

    results.push({ taskId: task.id, previousDueAt: task.dueAt, newDueAt });
  }

  return results;
}

/**
 * Validate a status transition, enforcing BR-12.
 *
 * The workbook writes a blank, a `FALSE` and an `X` to mean things it never distinguishes. Here,
 * closing a task without doing it always requires saying why.
 */
export function validateStatusChange(
  next: TaskStatus,
  detail: { cancellationReason?: string | null; notApplicableReason?: string | null; completedAt?: Date | null },
): void {
  if (next === 'cancelled' && !detail.cancellationReason?.trim()) {
    throw new Error('Cancelling a task requires a cancellation reason');
  }
  if (next === 'not_applicable' && !detail.notApplicableReason?.trim()) {
    throw new Error('Marking a task not applicable requires a reason');
  }
  if (next === 'completed' && detail.completedAt === null) {
    throw new Error('A completed task must record when it was completed');
  }
  if (next !== 'completed' && detail.completedAt != null) {
    throw new Error(`A task with status '${next}' must not have a completion time`);
  }
}
