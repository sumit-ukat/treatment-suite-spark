-- 0050 · Incident reports
-- Allows centre staff to log clinical and operational incidents.
-- The Executive Hub "Incident Reports" tile counts rows for the last 7 days.

create table public.incident_reports (
  id               uuid primary key default gen_random_uuid(),
  centre_id        uuid not null references public.centres(id),
  organisation_id  uuid not null,
  incident_type    text not null check (incident_type in ('client','centre','medication','staff','other')),
  severity         text not null check (severity in ('low','medium','high','critical')),
  client_id        uuid references public.clients(id),
  client_name      text,
  description      text not null,
  location         text,
  incident_at      timestamp with time zone not null default now(),
  reported_by      uuid not null default auth.uid(),
  created_at       timestamp with time zone not null default now()
);

alter table public.incident_reports enable row level security;

create policy "incident_reports_insert" on public.incident_reports
  for insert to authenticated
  with check (app.can_access_centre(centre_id));

create policy "incident_reports_select" on public.incident_reports
  for select to authenticated
  using (app.can_access_centre(centre_id));

insert into public.permissions (code, description, sensitivity_level)
values ('incidents.log', 'Log a clinical or operational incident report', 1)
on conflict (code) do nothing;

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
  v_org_id uuid;
  v_report_id uuid;
begin
  if not app.can_access_centre(p_centre_id) then
    raise exception 'Not permitted to access this centre' using errcode = '42501';
  end if;

  select organisation_id into v_org_id
  from public.centres where id = p_centre_id;

  insert into public.incident_reports
    (centre_id, organisation_id, incident_type, severity,
     client_id, client_name, description, location, incident_at, reported_by)
  values
    (p_centre_id, v_org_id, p_incident_type, p_severity,
     p_client_id, p_client_name, p_description, p_location,
     coalesce(p_incident_at, now()), auth.uid())
  returning id into v_report_id;

  return v_report_id;
end;
$$;

create or replace function public.log_incident_report(
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
language sql security invoker set search_path = ''
as $$
  select app.log_incident_report(
    p_centre_id, p_incident_type, p_severity,
    p_client_id, p_client_name, p_description, p_location, p_incident_at
  );
$$;

grant execute on function app.log_incident_report(uuid,text,text,uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.log_incident_report(uuid,text,text,uuid,text,text,text,timestamptz) to authenticated;

create or replace function app.incident_report_count_7d(p_centre_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select count(*)::integer
  from   public.incident_reports
  where  centre_id  = p_centre_id
  and    incident_at >= now() - interval '7 days';
$$;

create or replace function public.incident_report_count_7d(p_centre_id uuid)
returns integer
language sql security invoker set search_path = ''
as $$
  select app.incident_report_count_7d(p_centre_id);
$$;

grant execute on function app.incident_report_count_7d(uuid) to authenticated;
grant execute on function public.incident_report_count_7d(uuid) to authenticated;
