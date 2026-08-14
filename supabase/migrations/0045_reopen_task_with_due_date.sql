-- 0045 · Optional new due date when reopening a completed task
--
-- Adds p_new_due_at (default null) to reopen_client_task.
-- When supplied, the task's due_at is updated in the same transaction so
-- the reopen and the new deadline land atomically.

-- Drop the existing 2-param overloads so CREATE OR REPLACE can add the new signature.
drop function if exists app.reopen_client_task(uuid, text);
drop function if exists public.reopen_client_task(uuid, text);

create or replace function app.reopen_client_task(
  p_task_id     uuid,
  p_reason      text,
  p_new_due_at  timestamptz default null
)
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

  if v_task.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if v_task.status <> 'done' then
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
     set status        = 'todo',
         completed_at  = null,
         completed_by  = null,
         completion_note = null,
         due_at        = coalesce(p_new_due_at, due_at),
         updated_by    = auth.uid()
   where id = p_task_id;
end;
$$;

comment on function app.reopen_client_task is
  'The only path to reopening a completed task. Requires tasks.reopen and a reason, '
  'which is recorded in audit_events.reason via the app.change_reason GUC. '
  'Optionally resets the due date when p_new_due_at is supplied.';

-- PostgREST-visible wrapper.
create or replace function public.reopen_client_task(
  p_task_id     uuid,
  p_reason      text,
  p_new_due_at  timestamptz default null
)
returns void
language sql security invoker set search_path = ''
as $$
  select app.reopen_client_task(p_task_id, p_reason, p_new_due_at);
$$;

grant execute on function app.reopen_client_task(uuid, text, timestamptz)    to authenticated;
grant execute on function public.reopen_client_task(uuid, text, timestamptz) to authenticated;
