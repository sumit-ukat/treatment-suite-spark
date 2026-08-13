-- 0040 · Track reschedule count on client_tasks
--
-- Adds a reschedule_count column so the board load already knows which tasks
-- have been rescheduled — no extra query needed per task. The reschedule_task
-- RPC (0039) is updated to increment it atomically on each change.

alter table public.client_tasks
  add column if not exists reschedule_count int not null default 0;

-- Back-fill from the audit table for any rescheduled tasks that exist already.
update public.client_tasks ct
set reschedule_count = (
  select count(*) from public.task_date_changes tdc where tdc.task_id = ct.id
)
where exists (select 1 from public.task_date_changes tdc where tdc.task_id = ct.id);

-- Replace the reschedule_task RPC to also increment the counter.
create or replace function app.reschedule_task(
  p_task_id    uuid,
  p_new_due_at timestamptz,
  p_reason     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task         public.client_tasks;
  v_reason       text := nullif(btrim(coalesce(p_reason, '')), '');
  v_display_name text;
begin
  if not app.has_permission('tasks.complete') then
    raise exception 'Not permitted to reschedule tasks' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'A reason is required when rescheduling a task' using errcode = '22023';
  end if;

  select * into v_task from public.client_tasks where id = p_task_id;

  if v_task.id is null or not app.can_access_centre(v_task.centre_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  select display_name into v_display_name from public.user_profiles where id = auth.uid();

  insert into public.task_date_changes (task_id, old_due_at, new_due_at, reason, changed_by, changed_by_name)
  values (p_task_id, v_task.due_at, p_new_due_at, v_reason, auth.uid(), coalesce(v_display_name, 'Staff'));

  update public.client_tasks set
    due_at          = p_new_due_at,
    reschedule_count = reschedule_count + 1,
    updated_by      = auth.uid(),
    updated_at      = now()
  where id = p_task_id;
end;
$$;

-- Public wrapper is unchanged in signature — just recreate to pick up the new body.
create or replace function public.reschedule_task(
  p_task_id    uuid,
  p_new_due_at timestamptz,
  p_reason     text
)
returns void language sql security invoker set search_path = ''
as $$ select app.reschedule_task(p_task_id, p_new_due_at, p_reason); $$;

grant execute on function app.reschedule_task(uuid, timestamptz, text) to authenticated;
grant execute on function public.reschedule_task(uuid, timestamptz, text) to authenticated;
