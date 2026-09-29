-- 0059 · Undo for the two GP Summary sign-off steps
--
-- app.gp_summary_mark_doctor_informed / app.gp_summary_mark_confirmed (migration 0058) had no way
-- back: a mis-click stamped a name and a timestamp with nothing in the UI to clear it. These two
-- RPCs clear one sign-off back to unset, gated the same way as setting it (tasks.complete + the
-- task must actually be a GP Summary task, via app.gp_summary_task_or_raise).

create or replace function app.gp_summary_undo_doctor_informed(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.client_tasks := app.gp_summary_task_or_raise(p_task_id);
begin
  update public.gp_summary_details
     set doctor_informed_at = null,
         doctor_informed_by = null,
         ukat_doctor        = null,
         updated_at         = pg_catalog.now()
   where client_task_id = v_task.id;
end;
$$;

create or replace function app.gp_summary_undo_confirmed(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.client_tasks := app.gp_summary_task_or_raise(p_task_id);
begin
  update public.gp_summary_details
     set confirmed_checked_at = null,
         confirmed_checked_by = null,
         updated_at           = pg_catalog.now()
   where client_task_id = v_task.id;
end;
$$;

comment on function app.gp_summary_undo_doctor_informed is
  'Clears a mistaken "doctor informed" sign-off back to unset -- migration 0059.';
comment on function app.gp_summary_undo_confirmed is
  'Clears a mistaken "confirmed / checked" sign-off back to unset -- migration 0059.';

grant execute on function app.gp_summary_undo_doctor_informed(uuid) to authenticated;
grant execute on function app.gp_summary_undo_confirmed(uuid) to authenticated;

create or replace function public.gp_summary_undo_doctor_informed(p_task_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.gp_summary_undo_doctor_informed(p_task_id);
$$;

create or replace function public.gp_summary_undo_confirmed(p_task_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.gp_summary_undo_confirmed(p_task_id);
$$;

grant execute on function public.gp_summary_undo_doctor_informed(uuid) to authenticated;
grant execute on function public.gp_summary_undo_confirmed(uuid) to authenticated;
