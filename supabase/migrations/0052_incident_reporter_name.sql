-- 0052 · Store reporter display name on incident_reports
-- Adds a reported_by_name text column so the UI can show who logged each incident
-- without needing a join, matching the pattern used by client_concerns.logged_by_name.

alter table public.incident_reports
  add column if not exists reported_by_name text;

-- Back-fill existing rows from user_profiles
update public.incident_reports ir
set    reported_by_name = coalesce(up.display_name, 'Staff')
from   public.user_profiles up
where  up.id = ir.reported_by
  and  ir.reported_by_name is null;

-- Replace app.log_incident_report to also populate reported_by_name
create or replace function app.log_incident_report(
  p_centre_id     uuid,
  p_incident_type text,
  p_severity      text,
  p_client_id     uuid,
  p_client_name   text,
  p_description   text,
  p_location      text,
  p_incident_at   timestamp with time zone
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id       uuid;
  v_report_id    uuid;
  v_reporter_name text;
begin
  if not app.can_access_centre(p_centre_id) then
    raise exception 'Not permitted to access this centre' using errcode = '42501';
  end if;

  select organisation_id into v_org_id
  from public.centres where id = p_centre_id;

  select coalesce(display_name, 'Staff') into v_reporter_name
  from public.user_profiles where id = auth.uid();

  insert into public.incident_reports
    (centre_id, organisation_id, incident_type, severity,
     client_id, client_name, description, location, incident_at,
     reported_by, reported_by_name)
  values
    (p_centre_id, v_org_id, p_incident_type, p_severity,
     p_client_id, p_client_name, p_description, p_location,
     coalesce(p_incident_at, now()), auth.uid(), v_reporter_name)
  returning id into v_report_id;

  return v_report_id;
end;
$$;
