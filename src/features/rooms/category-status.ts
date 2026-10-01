import type { Tone } from '../../components/ui.tsx';
import type { BoardTask, Occupant } from './board-data.js';

export type CategoryKey =
  | 'admin'
  | 'gpsummary'
  | 'contact'
  | 'survey'
  | 'familyvisit'
  | 'lifestep'
  | 'careplan'
  | 'doctor'
  | 'custom';

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  admin: 'Admin',
  gpsummary: 'GP Summary',
  contact: 'Contact/Comms',
  survey: '7 Day Satisfaction',
  familyvisit: 'Family Visit',
  lifestep: 'Life Story / Step Work',
  careplan: 'Care Plan',
  doctor: 'Doctor – Thursday',
  custom: 'Side assignment',
};

/** One row per real task code, grouped by the category it belongs to on the board. Single source of
 * truth for both the board's category rollups and each category's internal-detail modal. */
export const COLUMNS = [
  { code: 'family_contact_24h',          label: '24hr',           full: '24-hour family contact',                 group: 'contact'  as const },
  { code: 'family_contact_week_1',        label: '1st Week',       full: 'Week 1 family contact',                  group: 'contact'  as const },
  { code: 'family_contact_week_2',        label: '2nd Week',       full: 'Week 2 family contact',                  group: 'contact'  as const },
  { code: 'family_contact_pre_discharge', label: 'Pre-Discharge',  full: 'Family contact 24 hrs before discharge', group: 'contact'  as const },
  { code: 'satisfaction_survey_7day', label: '7-Day Survey',   full: '7-day satisfaction survey',  group: 'survey'      as const },
  { code: 'life_story',        label: 'Life Story/Surrender', full: 'Life story / surrender',          group: 'lifestep' as const },
  { code: 'step_1',           label: 'Step 1',               full: '12-Step programme — Step 1',      group: 'lifestep' as const },
  { code: 'step_2',           label: 'Step 2',               full: '12-Step programme — Step 2',      group: 'lifestep' as const },
  { code: 'step_3',           label: 'Step 3',               full: '12-Step programme — Step 3',      group: 'lifestep' as const },
  { code: 'ccp',              label: 'CCP',                  full: 'Care & Continuing Plan (CCP)',     group: 'lifestep' as const },
  { code: 'session_intro',   label: 'Intro CP/121',    full: 'Introductory counselling session',  group: 'careplan' as const },
  { code: 'session_week_1', label: 'Week 1 CP/121',   full: 'Week 1 CP/121 counselling session', group: 'careplan' as const },
  { code: 'session_week_2', label: 'Week 2 CP/121',   full: 'Week 2 CP/121 counselling session', group: 'careplan' as const },
  { code: 'session_week_3', label: 'Week 3 CP/121',   full: 'Week 3 CP/121 counselling session', group: 'careplan' as const },
  { code: 'session_week_4', label: 'Week 4 CP/121',   full: 'Week 4 CP/121 counselling session', group: 'careplan' as const },
] as const;

const CATEGORY_TASK_TITLES = new Set<string>(COLUMNS.map((c) => c.full));

/** Manual tasks assigned from the Doctor – Thursday panel use category 'medical' — the only manual
 * tasks that do, since the Side assignment panel always assigns 'milestone' (see ManualTaskSection
 * in CategoryDetailPanel.tsx). */
export function isDoctorTask(task: BoardTask): boolean {
  return task.isManual && task.category === 'medical';
}

/** Manual tasks assigned from the Family Visit panel use category 'family_contact' — the app already
 * allows this category for a real, scheduled family contact task; a manually-logged visit reuses it
 * rather than inventing a new one, and is distinguished from those by `isManual`. */
export function isFamilyVisitTask(task: BoardTask): boolean {
  return task.isManual && task.category === 'family_contact';
}

/** A manual task only counts as "Side assignment" if it isn't one of the named category tasks
 * assigned via that category's own Assign button (those are matched into their category panel by
 * title, since manual tasks have no code — see ModuleTaskSection), and isn't a Doctor or Family Visit
 * task either. Otherwise it would show up twice. */
export function isCustomTask(task: BoardTask): boolean {
  return task.isManual && !CATEGORY_TASK_TITLES.has(task.title) && !isDoctorTask(task) && !isFamilyVisitTask(task);
}

export interface CategoryStatus {
  tone: Tone;
  label: string;
  sublabel?: string;
  fraction?: string;
  attentionCount: number;
  totalCount: number;
}

/** Same status vocabulary `TaskCell` renders, exposed as data so the board cell, the modal's field
 * grid, and the rollup below all agree on what "done"/"overdue"/"due" mean for one task. */
export function taskStatus(task: BoardTask): { tone: Tone; icon: string; label: string } {
  if (task.isNotApplicable) return { tone: 'neutral', icon: '×', label: 'Not applicable' };
  if (task.isComplete) return { tone: 'good', icon: '✓', label: task.completedBy ? `Done by ${task.completedBy}` : 'Done' };
  if (task.isOverdue) return { tone: 'alert', icon: '▲', label: 'Overdue' };
  if (task.isDueToday) return { tone: 'warn', icon: '●', label: 'Due today' };
  return { tone: 'neutral', icon: '—', label: 'Not yet due' };
}

function rollupTasks(tasks: readonly BoardTask[]): CategoryStatus {
  const applicable = tasks.filter((t) => !t.isNotApplicable);
  if (applicable.length === 0) {
    return { tone: 'neutral', label: 'No actions', attentionCount: 0, totalCount: tasks.length };
  }
  const overdue = applicable.filter((t) => t.isOverdue);
  const dueToday = applicable.filter((t) => t.isDueToday);
  const done = applicable.filter((t) => t.isComplete);
  // Shown even for a single-item category (Family Visit, Doctor, Side assignment often have just one task) so
  // those columns read the same as a busy one, instead of looking empty next to it.
  const fractionProp = { fraction: `${done.length}/${applicable.length}` };

  if (overdue.length > 0) {
    return {
      tone: 'alert',
      label: `${overdue.length} overdue`,
      ...(overdue.length === 1 ? { sublabel: overdue[0]!.title } : {}),
      ...fractionProp,
      attentionCount: overdue.length,
      totalCount: tasks.length,
    };
  }
  if (dueToday.length > 0) {
    return {
      tone: 'warn',
      label: `${dueToday.length} due`,
      ...(dueToday.length === 1 ? { sublabel: dueToday[0]!.title } : {}),
      ...fractionProp,
      attentionCount: dueToday.length,
      totalCount: tasks.length,
    };
  }
  if (done.length === applicable.length) {
    return { tone: 'good', label: 'Done', ...fractionProp, attentionCount: 0, totalCount: tasks.length };
  }
  // At least one task exists here and none of it is overdue, due today, or complete — it's pending
  // but not yet a problem. Distinct from the true "No actions" case above (nothing assigned at all),
  // which otherwise made a column with one on-track task look identical to an empty one.
  return { tone: 'neutral', label: 'On track', ...fractionProp, attentionCount: 0, totalCount: tasks.length };
}

/** One rollup per category, built from real task/field state only — never a fabricated value. */
export function categoryStatus(occupant: Occupant, category: CategoryKey): CategoryStatus {
  if (category === 'custom') {
    // 'side_assignment' is a real, template-backed task (task_templates, auto-created on every
    // admission — "Workbook col R"), not a manual one, so isCustomTask's isManual check never catches
    // it. Fold it in here alongside whatever staff add ad hoc, so it isn't invisible to every rollup.
    const sideAssignment = occupant.tasks.find((t) => t.code === 'side_assignment');
    const manual = occupant.tasks.filter(isCustomTask);
    return rollupTasks(sideAssignment ? [sideAssignment, ...manual] : manual);
  }

  if (category === 'doctor') {
    // No template-backed field or task exists for this category — only what staff manually assign.
    return rollupTasks(occupant.tasks.filter(isDoctorTask));
  }

  if (category === 'familyvisit') {
    // Same as 'doctor' — no fixed template ever creates one of these, only what staff manually log.
    return rollupTasks(occupant.tasks.filter(isFamilyVisitTask));
  }

  if (category === 'admin') {
    // Field-based, not task-based (GP Summary moved to its own 'gpsummary' category below) — the
    // only thing here that can be "wrong" rather than just informational is an unassigned therapist.
    if (!occupant.therapist) {
      return { tone: 'alert', label: '1 not assigned', sublabel: 'Focal Therapist', attentionCount: 1, totalCount: 9 };
    }
    return { tone: 'good', label: 'Done', attentionCount: 0, totalCount: 9 };
  }

  if (category === 'gpsummary') {
    const gp = occupant.tasks.find((t) => t.code === 'gp_summary');
    const base = rollupTasks(gp ? [gp] : []);
    // Tone/label/attentionCount still come from the task's own overdue/due/complete state above —
    // only the fraction (and the modal's "N internal details" count) swap to real progress through
    // the GP Summary Log's 5 steps, which says far more than the single underlying task's 0/1 or 1/1.
    if (!occupant.gpSummarySteps) return base;
    return {
      ...base,
      fraction: `${occupant.gpSummarySteps.done}/${occupant.gpSummarySteps.total}`,
      totalCount: occupant.gpSummarySteps.total,
    };
  }

  // Module-backed categories: contact / survey / lifestep / careplan
  const codes: readonly string[] = COLUMNS.filter((c) => c.group === category).map((c) => c.code);
  if (!occupant.programmeModules.includes(category)) {
    return { tone: 'neutral', label: 'Not in programme', attentionCount: 0, totalCount: 0 };
  }
  const tasks = occupant.tasks.filter((t) => codes.includes(t.code));
  return rollupTasks(tasks);
}
