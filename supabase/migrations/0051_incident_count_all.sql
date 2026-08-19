-- 0051 · Group-wide incident count (last 7 days)
-- Used by the Executive Hub to show a combined total across all centres
-- the authenticated user can access. RLS on incident_reports already
-- gates which rows are visible, so no extra centre filter is needed here.

create or replace function app.incident_report_count_all_7d()
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*)::integer
  from   public.incident_reports
  where  incident_at >= now() - interval '7 days';
$$;

create or replace function public.incident_report_count_all_7d()
returns integer
language sql security invoker set search_path = ''
as $$
  select app.incident_report_count_all_7d();
$$;

grant execute on function app.incident_report_count_all_7d() to authenticated;
grant execute on function public.incident_report_count_all_7d() to authenticated;
