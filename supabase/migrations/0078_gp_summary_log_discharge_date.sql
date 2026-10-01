-- 0078 · Expose actual_discharge_at on the GP Summary log, so it can be sorted by discharge date
-- (not just admission date) the same way the Discharge and Clients pages already can be. The
-- underlying join already has it on `a` (admissions) — nothing new to join, just select it.

drop function if exists app.gp_summary_log(uuid);
drop function if exists public.gp_summary_log(uuid);

create or replace function app.gp_summary_log(p_centre_id uuid)
returns table (
  admission_id             uuid,
  client_id                uuid,
  client_reference         text,
  client_name              text,
  admitted_at              timestamptz,
  admission_status         text,
  actual_discharge_at      timestamptz,
  surgery_name             text,
  surgery_email            text,
  surgery_phone            text,
  request_sent_at          date,
  request_sent_by_name     text,
  received_at              date,
  compliant                boolean,
  doctor_informed_at       timestamptz,
  doctor_informed_by_name  text,
  ukat_doctor              text,
  confirmed_checked_at     timestamptz,
  confirmed_checked_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_has_identity boolean := app.has_permission('clients.view_identity');
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  if not app.can_read('clients.view_operational') and not v_has_identity then
    return;
  end if;

  return query
    select
      a.id,
      a.client_id,
      c.reference,
      case when v_has_identity
           then trim(coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name)
           else null
      end,
      a.admitted_at,
      a.status,
      a.actual_discharge_at,
      d.surgery_name,
      d.surgery_email,
      d.surgery_phone,
      d.request_sent_at,
      sent_by.display_name,
      d.received_at,
      case when d.received_at is null then null
           else d.received_at <= ct.due_at::date
      end,
      d.doctor_informed_at,
      informed_by.display_name,
      d.ukat_doctor,
      d.confirmed_checked_at,
      confirmed_by.display_name
    from public.client_tasks ct
    join public.admissions a on a.id = ct.admission_id
    join public.clients c on c.id = a.client_id
    left join public.gp_summary_details d on d.client_task_id = ct.id
    left join public.user_profiles sent_by      on sent_by.id      = d.request_sent_by
    left join public.user_profiles informed_by  on informed_by.id  = d.doctor_informed_by
    left join public.user_profiles confirmed_by on confirmed_by.id = d.confirmed_checked_by
    where ct.code = 'gp_summary' and ct.centre_id = p_centre_id
    order by a.admitted_at desc;
end;
$$;

comment on function app.gp_summary_log is
  'Every GP Summary task at one centre (active and discharged admissions), most recent admission
   first — the data behind the GP Summary nav section. Requires clients.view_operational or
   clients.view_identity, and centre access, mirroring app.discharge_log. Migration 0078 added
   actual_discharge_at for sorting by discharge date.';

create or replace function public.gp_summary_log(p_centre_id uuid)
returns table (
  admission_id             uuid,
  client_id                uuid,
  client_reference         text,
  client_name              text,
  admitted_at              timestamptz,
  admission_status         text,
  actual_discharge_at      timestamptz,
  surgery_name             text,
  surgery_email            text,
  surgery_phone            text,
  request_sent_at          date,
  request_sent_by_name     text,
  received_at              date,
  compliant                boolean,
  doctor_informed_at       timestamptz,
  doctor_informed_by_name  text,
  ukat_doctor              text,
  confirmed_checked_at     timestamptz,
  confirmed_checked_by_name text
)
language sql
security invoker
set search_path = ''
as $$
  select * from app.gp_summary_log(p_centre_id);
$$;

comment on function public.gp_summary_log is
  'Thin PostgREST-visible wrapper over app.gp_summary_log. All checks and logic live in the app schema.';

grant execute on function app.gp_summary_log(uuid) to authenticated;
grant execute on function public.gp_summary_log(uuid) to authenticated;
