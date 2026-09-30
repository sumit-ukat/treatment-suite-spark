-- 0063 · GP Summary board-cell progress
--
-- The GP Summary board cell showed a fraction based on the single underlying client_task (always
-- 0/1 or 1/1) — barely informative next to a multi-step category's real "3/6". This gives the whole
-- board, in one query, how many of the 5 GP Summary Log steps (surgery details, request sent,
-- received, doctor informed, confirmed) are filled in per client, so the cell can show that instead.

create or replace function app.gp_summary_progress(p_centre_id uuid)
returns table (client_task_id uuid, steps_done integer, steps_total integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  if not app.can_read('clients.view_operational') then
    return;
  end if;

  return query
    select
      ct.id,
      (case when d.surgery_name          is not null then 1 else 0 end +
       case when d.request_sent_at       is not null then 1 else 0 end +
       case when d.received_at           is not null then 1 else 0 end +
       case when d.doctor_informed_at    is not null then 1 else 0 end +
       case when d.confirmed_checked_at  is not null then 1 else 0 end)::int,
      5
    from public.client_tasks ct
    left join public.gp_summary_details d on d.client_task_id = ct.id
    where ct.code = 'gp_summary' and ct.centre_id = p_centre_id;
end;
$$;

comment on function app.gp_summary_progress is
  'Steps filled in (0-5) per GP Summary task at a centre, for the board cell fraction -- migration 0063.';

grant execute on function app.gp_summary_progress(uuid) to authenticated;

create or replace function public.gp_summary_progress(p_centre_id uuid)
returns table (client_task_id uuid, steps_done integer, steps_total integer)
language sql
security invoker
set search_path = ''
as $$
  select * from app.gp_summary_progress(p_centre_id);
$$;

grant execute on function public.gp_summary_progress(uuid) to authenticated;
