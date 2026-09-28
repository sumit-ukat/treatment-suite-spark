import type { Tone } from '../../components/ui.tsx';
import type { BoardTask, Occupant } from './board-data.js';

export type CategoryKey =
  | 'admin'
  | 'contact'
  | 'survey'
  | 'familyvisit'
  | 'lifestep'
  | 'careplan'
  | 'doctor'
  | 'custom';

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  admin: 'Admin',
  contact: 'Contact/Comms',
  survey: '7 Day Satisfaction',
  familyvisit: 'Family Visit',
  lifestep: 'Life Story / Step Work',
  careplan: 'Care Plan',
  doctor: 'Doctor – Thursday',
  custom: 'Custom',
};

/** One row per real task code, grouped by the category it belongs to on the board. Single source of
 * truth for both the board's category rollups and each category's internal-detail modal. */
export const COLUMNS = [
  { code: 'family_contact_24h',          label: '24hr',           full: '24-hour family contact',                 group: 'contact'  as const },
  { code: 'family_contact_week_1',        label: '1st Week',       full: 'Week 1 family contact',                  group: 'contact'  as const },
  { code: 'family_contact_week_2',        label: '2nd Week',       full: 'Week 2 family contact',                  group: 'contact'  as const },
  { code: 'family_contact_pre_discharge', label: 'Pre-Discharge',  full: 'Family contact 24 hrs before discharge', group: 'contact'  as const },
  { code: 'satisfaction_survey_7day', label: '7-Day Survey',   full: '7-day satisfaction survey',  group: 'survey'      as const },
  { code: 'family_visit',            label: 'Family Visit',   full: 'Family visit',               group: 'familyvisit' as const },
  { code: 'life_story',        label: 'Life Story/Surrender', full: 'Life story / surrender',          group: 'lifestep' as const },
  { code: 'step_1',           label: 'Step 1',               full: '12-Step programme — Step 1',      group: 'lifestep' as const },
  { code: 'step_2',           label: 'Step 2',               full: '12-Step programme — Step 2',      group: 'lifestep' as const },
  { code: 'step_3',           label: 'Step 3',               full: '12-Step programme — Step 3',      group: 'lifestep' as const },
  { code: 'side_assignment',  label: 'Side Assignment',      full: 'Side assignment',                 group: 'lifestep' as const },
  { code: 'ccp',              label: 'CCP',                  full: 'Care & Continuing Plan (CCP)',     group: 'lifestep' as const },
  { code: 'session_intro',   label: 'Intro CP/121',    full: 'Introductory counselling session',  group: 'careplan' as const },
  { code: 'session_week_1', label: 'Week 1 CP/121',   full: 'Week 1 CP/121 counselling session', group: 'careplan' as const },
  { code: 'session_week_2', label: 'Week 2 CP/121',   full: 'Week 2 CP/121 counselling session', group: 'careplan' as const },
  { code: 'session_week_3', label: 'Week 3 CP/121',   full: 'Week 3 CP/121 counselling session', group: 'careplan' as const },
  { code: 'session_week_4', label: 'Week 4 CP/121',   full: 'Week 4 CP/121 counselling session', group: 'careplan' as const },
] as const;

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
  const fractionProp = applicable.length > 1 ? { fraction: `${done.length}/${applicable.length}` } : {};

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
  return { tone: 'neutral', label: 'No actions', ...fractionProp, attentionCount: 0, totalCount: tasks.length };
}

/** One rollup per category, built from real task/field state only — never a fabricated value. */
export function categoryStatus(occupant: Occupant, category: CategoryKey): CategoryStatus {
  if (category === 'custom') {
    return rollupTasks(occupant.tasks.filter((t) => t.isManual));
  }

  if (category === 'doctor') {
    // No field or task anywhere backs "Doctor – Thursday" today — an honest empty state, not a guess.
    return { tone: 'neutral', label: 'No actions', attentionCount: 0, totalCount: 0 };
  }

  if (category === 'admin') {
    const gp = occupant.tasks.find((t) => t.code === 'gp_summary');
    const attention = (occupant.therapist ? 0 : 1) + (gp && !gp.isComplete && !gp.isNotApplicable && (gp.isOverdue || gp.isDueToday) ? 1 : 0);
    if (!occupant.therapist) {
      return { tone: 'alert', label: '1 not assigned', sublabel: 'Focal Therapist', attentionCount: attention, totalCount: 10 };
    }
    if (gp?.isOverdue) return { tone: 'alert', label: '1 overdue', sublabel: 'GP Summary', attentionCount: attention, totalCount: 10 };
    if (gp?.isDueToday) return { tone: 'warn', label: '1 due', sublabel: 'GP Summary', attentionCount: attention, totalCount: 10 };
    return { tone: 'good', label: 'Done', attentionCount: 0, totalCount: 10 };
  }

  // Module-backed categories: contact / survey / familyvisit / lifestep / careplan
  const codes: readonly string[] = COLUMNS.filter((c) => c.group === category).map((c) => c.code);
  if (!occupant.programmeModules.includes(category)) {
    return { tone: 'neutral', label: 'Not in programme', attentionCount: 0, totalCount: 0 };
  }
  const tasks = occupant.tasks.filter((t) => codes.includes(t.code));
  return rollupTasks(tasks);
}
