-- 0026 · Task completion and reopening — and closing a direct-update bypass
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05).
--
-- The gap this closes: 20 task templates are seeded, tasks are generated on admission, and the room
-- board counts them as overdue/due-today — but nothing anywhere could ever mark one done. No
-- `complete` function existed in either schema. The task system, which is the entire point of the
-- workbook this tool replaces, was write-once and read-only: the counts could never change.
--
-- A second, separate problem found while building this. The `client_tasks_update` policy allowed any
-- holder of `tasks.complete` (or `tasks.assign`) to UPDATE **any column** of any task at an accessible
-- centre, directly through PostgREST. Because RLS cannot restrict columns, that policy — correct as a
-- row filter — was doing nothing to constrain *what* could be changed. A staff member could:
--   * complete a task that requires a completion note, without one;
--   * set `completed_by` to a different user, misattributing who did the work;
--   * reopen a completed task while holding only `tasks.complete`, never `tasks.reopen`;
--   * edit `due_at` to move their own deadline and erase being overdue.
-- The last one matters most: an operations-compliance tool whose deadlines the accountable person can
-- silently rewrite does not measure compliance. None of these are hypothetical — all four are plain
-- PostgREST PATCH calls that the policy permits.
--
-- The fix is the trusted-backend principle applied properly: UPDATE is revoked from `authenticated`
-- and `anon` entirely, so the only way to change a task's state is through the functions below, which
-- own every rule. Column-level grants were the alternative; a full revoke is chosen because there is
-- no screen today that updates a task directly, so nothing needs the exception, and an exception
-- granted "just in case" is how the original bypass came to exist. When an assignment UI is built it
-- gets an `assign` RPC, not a re-grant.
--
-- `client_tasks_update` is deliberately KEPT rather than dropped. It cannot be exercised by
-- `authenticated` now that the grant is gone, but if UPDATE is ever re-granted, its absence would mean
-- a re-grant silently carries no row-level filter at all. It stays as the second lock.
--
-- Note: no seeded template sets `prior_task_code`, so no task's due date depends on another task's
-- completion today. `app.compute_due_at` supports that chain, but wiring recalculation-on-completion
-- now would be machinery with nothing to drive it — left out deliberately, to be added with the first
-- template that actually uses it.

-- Completing a task. Every rule lives here because this is now the only path.
create or replace function app.complete_client_task(p_task_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task          public.client_tasks;
  v_requires_note boolean := false;
  v_note          text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not app.has_permission('tasks.complete') then
    raise exception 'Not permitted to complete tasks' using errcode = '42501';
  end if;

  select * into v_task from public.client_tasks where id = p_task_id;

  -- One message covers "no such task" and "task at a centre you cannot reach". Two distinct errors
  -- would let a caller probe which task ids exist elsewhere in the organisation.
  if v_task.id is null or not app.can_access_centre(v_task.centre_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if v_task.status = 'completed' then
    raise exception 'Task is already completed' using errcode = '22023';
  end if;

  if v_task.status in ('cancelled', 'not_applicable') then
    raise exception 'A % task cannot be completed directly', v_task.status using errcode = '22023';
  end if;

  -- The note requirement is a property of the template, not the task row, so it must be looked up.
  -- An ad-hoc task (template_id null) has no such requirement.
  if v_task.template_id is not null then
    select t.requires_completion_note into v_requires_note
      from public.task_templates t
     where t.id = v_task.template_id;
  end if;

  if coalesce(v_requires_note, false) and v_note is null then
    raise exception 'This task requires a completion note' using errcode = '22023';
  end if;

  update public.client_tasks
     set status           = 'completed',
         completed_at     = pg_catalog.now(),
         -- Always the caller. Never a parameter: who did the work is not the caller's to assert.
         completed_by     = auth.uid(),
         completion_notes = v_note,
         updated_by       = auth.uid()
   where id = p_task_id;
end;
$$;

comment on function app.complete_client_task is
  'The only path to completing a task. Enforces tasks.complete, centre access, current state, and the template''s completion-note requirement. completed_by is always the caller.';

-- Reopening a completed task. A separate permission because it erases a compliance record: the task
-- stops counting as done, and if it was overdue it becomes overdue again.
create or replace function app.reopen_client_task(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task   public.client_tasks;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not app.has_permission('tasks.reopen') then
    raise exception 'Not permitted to reopen tasks' using errcode = '42501';
  end if;

  select * into v_task from public.client_tasks where id = p_task_id;

  if v_task.id is null or not app.can_access_centre(v_task.centre_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if v_task.status <> 'completed' then
    raise exception 'Only a completed task can be reopened' using errcode = '22023';
  end if;

  -- Required, not optional: undoing a completion record without saying why is exactly the change an
  -- audit trail exists to explain.
  if v_reason is null then
    raise exception 'A reason is required to reopen a task' using errcode = '22023';
  end if;

  -- Picked up by app.audit_row and written to audit_events.reason. Transaction-local.
  perform set_config('app.change_reason', v_reason, true);

  update public.client_tasks
     set status           = 'not_started',
         -- The completed_has_timestamp CHECK requires this to be null whenever status is not
         -- 'completed', so clearing it is mandatory, not tidiness.
         completed_at     = null,
         completed_by     = null,
         -- Cleared because they describe a completion that no longer stands. Not lost: app.audit_row
         -- records the whole previous row.
         completion_notes = null,
         updated_by       = auth.uid()
   where id = p_task_id;
end;
$$;

comment on function app.reopen_client_task is
  'The only path to reopening a completed task. Requires tasks.reopen and a reason, which is recorded in audit_events.reason via the app.change_reason GUC.';

-- PostgREST-visible wrappers. See migration 0024 for why these exist; they add no logic.
create or replace function public.complete_client_task(p_task_id uuid, p_note text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.complete_client_task(p_task_id, p_note);
$$;

create or replace function public.reopen_client_task(p_task_id uuid, p_reason text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.reopen_client_task(p_task_id, p_reason);
$$;

grant execute on function app.complete_client_task(uuid, text) to authenticated;
grant execute on function app.reopen_client_task(uuid, text) to authenticated;
grant execute on function public.complete_client_task(uuid, text) to authenticated;
grant execute on function public.reopen_client_task(uuid, text) to authenticated;

-- Close the bypass. The SECURITY DEFINER functions above run as the table owner and are unaffected,
-- as are app.generate_admission_tasks, app.recalculate_discharge_tasks and
-- app.reapply_task_applicability, which also write to this table.
revoke update on public.client_tasks from authenticated;
revoke update on public.client_tasks from anon;
