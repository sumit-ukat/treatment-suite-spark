import { describe, expect, it } from 'vitest';
import { PRIMROSE_LODGE_SETTINGS } from './centre-settings.js';
import {
  computeDueAt,
  generateTasksForAdmission,
  isOverdue,
  recalculateOpenTasks,
  validateStatusChange,
  type AdmissionContext,
  type ClientTask,
  type TaskTemplate,
} from './tasks.js';
import { fromZonedDateString, toWallClock, toZonedDateString } from './zoned-time.js';

const LONDON = 'Europe/London';
const settings = PRIMROSE_LODGE_SETTINGS;

const template = (over: Partial<TaskTemplate> = {}): TaskTemplate => ({
  code: 't',
  name: 'Task',
  category: 'admin',
  dueBasis: 'admission',
  dueOffset: 0,
  dueOffsetUnit: 'days',
  isRequired: true,
  rescheduleOnDischargeChange: false,
  visibilityLevel: 1,
  ...over,
});

const ctx = (over: Partial<AdmissionContext> = {}): AdmissionContext => ({
  admittedAt: fromZonedDateString('2026-06-01', LONDON, { hour: 11, minute: 0 }),
  plannedDischargeDate: '2026-06-28',
  actualDischargeAt: null,
  settings,
  ...over,
});

describe('computeDueAt — admission basis', () => {
  it('computes the 24-hour family contact in elapsed hours', () => {
    const due = computeDueAt(template({ dueOffset: 24, dueOffsetUnit: 'hours' }), ctx());
    expect(due?.getTime()).toBe(ctx().admittedAt.getTime() + 86_400_000);
  });

  it('computes weekly session offsets as calendar days', () => {
    for (const [weeks, expected] of [
      [1, '2026-06-08'],
      [2, '2026-06-15'],
      [3, '2026-06-22'],
      [4, '2026-06-29'],
    ] as const) {
      const due = computeDueAt(template({ dueOffset: weeks, dueOffsetUnit: 'weeks' }), ctx());
      expect(toZonedDateString(due!, LONDON)).toBe(expected);
    }
  });

  it('gives the intro session a zero offset landing on the admission day', () => {
    const due = computeDueAt(template({ dueOffset: 0, dueOffsetUnit: 'days' }), ctx());
    expect(toZonedDateString(due!, LONDON)).toBe('2026-06-01');
  });
});

describe('computeDueAt — planned discharge basis', () => {
  it('computes the pre-discharge contact 24 hours before the deadline time', () => {
    const due = computeDueAt(
      template({ dueBasis: 'planned_discharge', dueOffset: -24, dueOffsetUnit: 'hours' }),
      ctx(),
    );
    expect(toZonedDateString(due!, LONDON)).toBe('2026-06-27');
    expect(toWallClock(due!, LONDON)).toMatchObject({ hour: 17 });
  });

  it('returns null when no discharge date exists yet', () => {
    const due = computeDueAt(
      template({ dueBasis: 'planned_discharge', dueOffset: -24, dueOffsetUnit: 'hours' }),
      ctx({ plannedDischargeDate: null }),
    );
    expect(due).toBeNull();
  });
});

describe('computeDueAt — other bases', () => {
  it('returns null for a manual basis rather than guessing', () => {
    expect(computeDueAt(template({ dueBasis: 'manual' }), ctx())).toBeNull();
  });

  it('returns null for actual discharge before the client has left', () => {
    expect(computeDueAt(template({ dueBasis: 'actual_discharge', dueOffset: 7 }), ctx())).toBeNull();
  });

  it('computes from an actual discharge once it exists', () => {
    const actualDischargeAt = fromZonedDateString('2026-06-20', LONDON, { hour: 10, minute: 0 });
    const due = computeDueAt(
      template({ dueBasis: 'actual_discharge', dueOffset: 7, dueOffsetUnit: 'days' }),
      ctx({ actualDischargeAt }),
    );
    expect(toZonedDateString(due!, LONDON)).toBe('2026-06-27');
  });

  it('chains from a prior task completion when that task is done', () => {
    const step1CompletedAt = fromZonedDateString('2026-06-10', LONDON, { hour: 15, minute: 0 });
    const due = computeDueAt(
      template({ dueBasis: 'prior_task_completion', priorTaskCode: 'step_1', dueOffset: 7, dueOffsetUnit: 'days' }),
      ctx({ completedTaskTimes: new Map([['step_1', step1CompletedAt]]) }),
    );
    expect(toZonedDateString(due!, LONDON)).toBe('2026-06-17');
  });

  it('returns null while the prior task is still open', () => {
    const due = computeDueAt(
      template({ dueBasis: 'prior_task_completion', priorTaskCode: 'step_1', dueOffset: 7 }),
      ctx({ completedTaskTimes: new Map() }),
    );
    expect(due).toBeNull();
  });
});

describe('isOverdue (BR-11)', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const open = { status: 'not_started' as const, completedAt: null };

  it('is false at exactly the due instant and true one millisecond later', () => {
    expect(isOverdue({ ...open, dueAt: now }, now)).toBe(false);
    expect(isOverdue({ ...open, dueAt: new Date(now.getTime() - 1) }, now)).toBe(true);
  });

  it('is false for a task with no due date', () => {
    expect(isOverdue({ ...open, dueAt: null }, now)).toBe(false);
  });

  it('is false once completed, however late', () => {
    expect(
      isOverdue(
        { status: 'completed', dueAt: new Date('2026-06-01T00:00:00Z'), completedAt: now },
        now,
      ),
    ).toBe(false);
  });

  it.each(['cancelled', 'not_applicable', 'completed'] as const)(
    'is false for terminal status %s',
    (status) => {
      expect(isOverdue({ status, dueAt: new Date('2026-06-01T00:00:00Z'), completedAt: null }, now)).toBe(
        false,
      );
    },
  );

  it.each(['not_started', 'scheduled', 'in_progress', 'blocked', 'awaiting_review'] as const)(
    'is true for open status %s past its due date',
    (status) => {
      expect(isOverdue({ status, dueAt: new Date('2026-06-01T00:00:00Z'), completedAt: null }, now)).toBe(
        true,
      );
    },
  );
});

describe('generateTasksForAdmission (BR-13)', () => {
  const templates = [
    template({ code: 'family_contact_24h', name: '24h family contact', category: 'family_contact', dueOffset: 24, dueOffsetUnit: 'hours' }),
    template({ code: 'satisfaction_survey_7day', name: '7 day survey', category: 'survey', dueOffset: 7 }),
    template({ code: 'family_contact_pre_discharge', name: 'Pre-discharge contact', category: 'family_contact', dueBasis: 'planned_discharge', dueOffset: -24, dueOffsetUnit: 'hours' }),
    template({ code: 'step_1', name: 'Step 1', category: 'milestone', dueBasis: 'manual' }),
  ];

  it('creates one task per template, all not started', () => {
    const tasks = generateTasksForAdmission(templates, ctx());
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => t.status === 'not_started')).toBe(true);
  });

  it('computes each due date from its own basis', () => {
    const tasks = generateTasksForAdmission(templates, ctx());
    expect(toZonedDateString(tasks[0]!.dueAt!, LONDON)).toBe('2026-06-02');
    expect(toZonedDateString(tasks[1]!.dueAt!, LONDON)).toBe('2026-06-08');
    expect(toZonedDateString(tasks[2]!.dueAt!, LONDON)).toBe('2026-06-27');
    expect(tasks[3]!.dueAt).toBeNull(); // manual basis is a legitimate open state
  });
});

describe('recalculateOpenTasks (BR-10)', () => {
  const preDischarge = template({
    code: 'family_contact_pre_discharge',
    dueBasis: 'planned_discharge',
    dueOffset: -24,
    dueOffsetUnit: 'hours',
    rescheduleOnDischargeChange: true,
  });
  const admissionBased = template({ code: 'step_1', dueBasis: 'admission', dueOffset: 7 });
  const pinned = template({
    code: 'pinned',
    dueBasis: 'planned_discharge',
    dueOffset: -24,
    dueOffsetUnit: 'hours',
    rescheduleOnDischargeChange: false,
  });
  const byCode = new Map([
    [preDischarge.code, preDischarge],
    [admissionBased.code, admissionBased],
    [pinned.code, pinned],
  ]);

  const task = (over: Partial<ClientTask>): ClientTask => ({
    id: 'task-1',
    templateCode: 'family_contact_pre_discharge',
    category: 'family_contact',
    title: 'Pre-discharge contact',
    status: 'not_started',
    dueAt: fromZonedDateString('2026-06-27', LONDON, { hour: 17, minute: 0 }),
    completedAt: null,
    assignedUserId: null,
    responsibleRoleCode: 'support_staff',
    cancellationReason: null,
    notApplicableReason: null,
    ...over,
  });

  // Discharge moves from 28 June to 12 July.
  const extended = ctx({ plannedDischargeDate: '2026-07-12' });

  it('moves an open discharge-based deadline', () => {
    const [result] = recalculateOpenTasks([task({})], byCode, extended);
    expect(result).toBeDefined();
    expect(toZonedDateString(result!.newDueAt!, LONDON)).toBe('2026-07-11');
    expect(toZonedDateString(result!.previousDueAt!, LONDON)).toBe('2026-06-27');
  });

  it('never touches a completed task, so its deadline stays as historical evidence', () => {
    const completed = task({
      status: 'completed',
      completedAt: fromZonedDateString('2026-06-26', LONDON, { hour: 9, minute: 0 }),
    });
    expect(recalculateOpenTasks([completed], byCode, extended)).toHaveLength(0);
  });

  it.each(['cancelled', 'not_applicable'] as const)('skips a %s task', (status) => {
    expect(recalculateOpenTasks([task({ status })], byCode, extended)).toHaveLength(0);
  });

  it('leaves admission-based tasks alone', () => {
    const t = task({ id: 'task-2', templateCode: 'step_1' });
    expect(recalculateOpenTasks([t], byCode, extended)).toHaveLength(0);
  });

  it('respects a template that opts out of rescheduling', () => {
    const t = task({ id: 'task-3', templateCode: 'pinned' });
    expect(recalculateOpenTasks([t], byCode, extended)).toHaveLength(0);
  });

  it('reports nothing when the date has not actually moved', () => {
    expect(recalculateOpenTasks([task({})], byCode, ctx())).toHaveLength(0);
  });

  it('ignores ad-hoc tasks that have no template', () => {
    expect(recalculateOpenTasks([task({ templateCode: null })], byCode, extended)).toHaveLength(0);
  });

  it('handles a mixed set, returning only what genuinely moved', () => {
    const tasks = [
      task({ id: 'a' }),
      task({ id: 'b', status: 'completed', completedAt: new Date('2026-06-20T09:00:00Z') }),
      task({ id: 'c', templateCode: 'step_1' }),
      task({ id: 'd', templateCode: 'pinned' }),
      task({ id: 'e', status: 'in_progress' }),
    ];
    expect(recalculateOpenTasks(tasks, byCode, extended).map((r) => r.taskId)).toEqual(['a', 'e']);
  });
});

describe('validateStatusChange (BR-12)', () => {
  it('requires a reason to cancel', () => {
    expect(() => validateStatusChange('cancelled', { cancellationReason: '  ' })).toThrow(
      /cancellation reason/,
    );
    expect(() => validateStatusChange('cancelled', { cancellationReason: 'Client left early' })).not.toThrow();
  });

  it('requires a reason to mark not applicable', () => {
    expect(() => validateStatusChange('not_applicable', {})).toThrow(/requires a reason/);
    expect(() =>
      validateStatusChange('not_applicable', { notApplicableReason: 'No family contact permitted' }),
    ).not.toThrow();
  });

  it('requires a completion time to complete', () => {
    expect(() => validateStatusChange('completed', { completedAt: null })).toThrow(/when it was completed/);
    expect(() => validateStatusChange('completed', { completedAt: new Date() })).not.toThrow();
  });

  it('forbids a completion time on any non-completed status', () => {
    expect(() => validateStatusChange('in_progress', { completedAt: new Date() })).toThrow(
      /must not have a completion time/,
    );
  });

  it('keeps cancelled and not-applicable genuinely distinct', () => {
    // The workbook conflates blank / FALSE / X. Here each closure carries its own reason field.
    expect(() => validateStatusChange('cancelled', { notApplicableReason: 'x' })).toThrow();
    expect(() => validateStatusChange('not_applicable', { cancellationReason: 'x' })).toThrow();
  });
});
