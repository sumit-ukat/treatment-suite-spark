-- 0081 · Add graduated_count to app.centre_client_activity
--
-- Completes the discharge-type breakdown the Executive Hub's Client activity row shows: Discharged
-- (any type) was already there, Early Discharged and Transferred too — Graduated (discharge_type =
-- 'planned') was the missing piece of that same taxonomy, and fills what was otherwise a blank 5th
-- card slot in the row.

drop function if exists app.centre_client_activity(uuid, date, date);
drop function if exists public.centre_client_activity(uuid, date, date);

create or replace function app.centre_client_activity(p_centre_id uuid, p_start date, p_end date)
returns table(
  admitted_count integer,
  discharged_count integer,
  early_discharged_count integer,
  transferred_count integer,
  graduated_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  if not app.can_read('clients.view_operational') and not app.has_permission('clients.view_identity') then
    return;
  end if;

  return query
    select
      (select count(*)::integer from public.admissions
        where centre_id = p_centre_id
          and admitted_at::date between p_start and p_end),
      (select count(*)::integer from public.admissions
        where centre_id = p_centre_id and status = 'discharged'
          and actual_discharge_at::date between p_start and p_end),
      (select count(*)::integer from public.admissions
        where centre_id = p_centre_id and status = 'discharged' and discharge_type = 'early'
          and actual_discharge_at::date between p_start and p_end),
      (select count(*)::integer from public.admissions
        where centre_id = p_centre_id and status = 'discharged' and discharge_type = 'transfer'
          and actual_discharge_at::date between p_start and p_end),
      (select count(*)::integer from public.admissions
        where centre_id = p_centre_id and status = 'discharged' and discharge_type = 'planned'
          and actual_discharge_at::date between p_start and p_end);
end;
$$;

create or replace function public.centre_client_activity(p_centre_id uuid, p_start date, p_end date)
returns table(
  admitted_count integer,
  discharged_count integer,
  early_discharged_count integer,
  transferred_count integer,
  graduated_count integer
)
language sql security invoker set search_path = ''
as $$
  select * from app.centre_client_activity(p_centre_id, p_start, p_end);
$$;

comment on function app.centre_client_activity is
  'Period-scoped client activity for one centre: admitted / discharged / early discharged / '
  'transferred / graduated counts within [p_start, p_end] inclusive. Powers the Executive Hub''s '
  'Client activity row for centres configured in the database (currently Primrose Lodge only). '
  'Migration 0081 added graduated_count.';

grant execute on function app.centre_client_activity(uuid, date, date)    to authenticated;
grant execute on function public.centre_client_activity(uuid, date, date) to authenticated;
