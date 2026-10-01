-- 0080 · Period-scoped client activity counts for the Executive Hub's new "Client activity" row
--
-- Four figures for one centre, over a caller-chosen date range: Total Clients (admitted in range),
-- Discharged (any type, in range), Early Discharged, Transferred — the breakdown the group's own
-- in-treatment/extended-stay counts don't cover, since those are current-state snapshots and these
-- are period events. One consolidated RPC rather than four separate ones (mirroring
-- app.early_discharge_count's existing single-purpose style, just parameterised by date range and
-- widened to the other 3 figures instead of four separate round trips from the client).
--
-- p_start/p_end are inclusive calendar dates in the centre's own timezone-naive sense — same
-- approximation the rest of this app's admin-level date filters already use (see
-- lib/date-presets.ts), not full per-centre zoned-time arithmetic.
--
-- Gated on app.can_access_centre + clients.view_operational/view_identity, matching
-- app.discharge_log and app.gp_summary_log's pattern — the sibling app.early_discharge_count has no
-- such check at all (any authenticated caller can query any centre_id), a pre-existing gap not
-- introduced here and not fixed here either, since widening this migration's scope to patch an
-- unrelated function risks changing behaviour nobody asked to change.

create or replace function app.centre_client_activity(p_centre_id uuid, p_start date, p_end date)
returns table(
  admitted_count integer,
  discharged_count integer,
  early_discharged_count integer,
  transferred_count integer
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
          and actual_discharge_at::date between p_start and p_end);
end;
$$;

create or replace function public.centre_client_activity(p_centre_id uuid, p_start date, p_end date)
returns table(
  admitted_count integer,
  discharged_count integer,
  early_discharged_count integer,
  transferred_count integer
)
language sql security invoker set search_path = ''
as $$
  select * from app.centre_client_activity(p_centre_id, p_start, p_end);
$$;

comment on function app.centre_client_activity is
  'Period-scoped client activity for one centre: admitted / discharged / early discharged / '
  'transferred counts within [p_start, p_end] inclusive. Powers the Executive Hub''s Client '
  'activity row for centres configured in the database (currently Primrose Lodge only). '
  'Migration 0080.';

grant execute on function app.centre_client_activity(uuid, date, date)    to authenticated;
grant execute on function public.centre_client_activity(uuid, date, date) to authenticated;
