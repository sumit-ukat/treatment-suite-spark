-- 0064 · GP Summary log — a centre-wide view, same shape as discharge_log (migration 0057)
--
-- Replaces the centre's manual "GP Summary Log" spreadsheet with a live view over the exact same
-- client_tasks / gp_summary_details rows the Treatment Board's GP Summary category panel already
-- reads and writes (migrations 0058/0059/0061/0063). There is only ever one copy of this data:
-- editing it from the Treatment Board (surgery details, sign-offs) is what this page shows, and
-- there is nothing to edit here that would need writing back the other way — this is a read view,
-- the same way app.discharge_log is.
--
-- Unlike discharge_log, this isn't scoped to a status — a client's GP Summary is due within 3 days
-- of admission regardless of whether they've since been discharged, so both active and discharged
-- admissions with a gp_summary task appear here.

create or replace function app.gp_summary_log(p_centre_id uuid)
returns table (
  admission_id             uuid,
  client_id                uuid,
  client_reference         text,
  client_name              text,
  admitted_at              timestamptz,
  admission_status         text,
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
  -- Same nulling rule as app.client_summary / app.discharge_log: a caller who can only see that a
  -- client exists (clients.view_operational), not who they are, still gets the row, just not a name.
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
   clients.view_identity, and centre access, mirroring app.discharge_log. Migration 0064.';

create or replace function public.gp_summary_log(p_centre_id uuid)
returns table (
  admission_id             uuid,
  client_id                uuid,
  client_reference         text,
  client_name              text,
  admitted_at              timestamptz,
  admission_status         text,
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
