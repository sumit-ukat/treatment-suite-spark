-- 0049 · Early discharge count RPC
-- Returns the number of non-planned discharges (early, transfer, other) for a
-- given centre. Powers the "Discharge" tile on the Executive Hub for centres
-- that are configured in the database (currently Primrose Lodge only).

create or replace function app.early_discharge_count(p_centre_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*)::integer
  from   public.admissions
  where  centre_id    = p_centre_id
  and    status       = 'discharged'
  and    discharge_type = 'early';
$$;

create or replace function public.early_discharge_count(p_centre_id uuid)
returns integer
language sql security invoker set search_path = ''
as $$
  select app.early_discharge_count(p_centre_id);
$$;

grant execute on function app.early_discharge_count(uuid)    to authenticated;
grant execute on function public.early_discharge_count(uuid) to authenticated;
