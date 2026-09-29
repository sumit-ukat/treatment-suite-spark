-- 0057 · Discharge report fields + a centre-wide discharge log
--
-- Replaces the centre's manual discharge-report spreadsheet ("PL Discharge Reports & Secondary
-- Treatment Referrals"). That sheet tracks, per discharged client: KIPU No. (now clients.reference,
-- migration 0056), the date they left, what happened with the report (sent to GP / handed to client /
-- referred to housing / early discharge...), where they went, free-text notes, the date the report was
-- actually sent, and which staff member handled it.
--
-- Four new columns on admissions carry everything the sheet tracks that this app didn't already have.
-- "Which staff member" is NOT a new column: finalise_discharge already sets
-- admissions.updated_by = auth.uid() in the same statement that sets status = 'discharged', so that
-- already answers "who" — app.discharge_log below resolves it to a name inline (security definer, so
-- it can safely join user_profiles the same way app.client_admission_history already joins
-- staff_assignments, without a separate name-resolver RPC).

alter table public.admissions
  add column if not exists discharge_report_status text,
  add column if not exists discharge_location       text,
  add column if not exists discharge_notes          text,
  add column if not exists discharge_report_sent_at date;

-- ─── finalise_discharge: capture the four fields at the moment of discharge ────────────────────────

drop function if exists app.finalise_discharge(uuid, text, timestamptz, text);
drop function if exists public.finalise_discharge(uuid, text, timestamptz, text);

create or replace function app.finalise_discharge(
  p_admission_id        uuid,
  p_discharge_type      text,
  p_actual_discharge_at timestamptz,
  p_reason              text,
  p_report_status       text default null,
  p_location            text default null,
  p_notes               text default null,
  p_report_sent_at      date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm    public.admissions;
  v_req    public.discharge_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_at     timestamptz := coalesce(p_actual_discharge_at, pg_catalog.now());
begin
  if not app.has_permission('discharge.finalise') then
    raise exception 'Not permitted to finalise a discharge' using errcode = '42501';
  end if;

  if p_discharge_type not in ('planned', 'early', 'transfer', 'other') then
    raise exception 'Not a valid discharge type: %', p_discharge_type using errcode = '22023';
  end if;

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be discharged' using errcode = '22023';
  end if;

  if v_at < v_adm.admitted_at then
    raise exception 'A discharge cannot be recorded before the admission it discharges' using errcode = '22023';
  end if;

  if v_at > pg_catalog.now() + interval '1 hour' then
    raise exception 'A discharge cannot be recorded in the future' using errcode = '22023';
  end if;

  if p_discharge_type <> 'planned' then
    select * into v_req from public.discharge_requests
     where admission_id = p_admission_id
       and discharge_type = p_discharge_type
       and status = 'approved'
     order by approved_at desc
     limit 1;

    if v_req.id is null then
      raise exception
        'An approved % discharge request is required before finalising this discharge', p_discharge_type
        using errcode = '22023';
    end if;

    update public.discharge_requests
       set status = 'finalised', finalised_at = pg_catalog.now()
     where id = v_req.id;
  end if;

  if v_reason is not null then
    perform set_config('app.change_reason', v_reason, true);
  end if;

  update public.room_allocations
     set ended_at = v_at, ended_by = auth.uid()
   where admission_id = p_admission_id and ended_at is null;

  update public.admissions
     set status                   = 'discharged',
         actual_discharge_at      = v_at,
         discharge_type           = p_discharge_type,
         discharge_report_status  = nullif(btrim(coalesce(p_report_status, '')), ''),
         discharge_location       = nullif(btrim(coalesce(p_location, '')), ''),
         discharge_notes          = nullif(btrim(coalesce(p_notes, '')), ''),
         discharge_report_sent_at = p_report_sent_at,
         updated_by               = auth.uid()
   where id = p_admission_id;
end;
$$;

comment on function app.finalise_discharge is
  'Ends the stay: closes the open room allocation, marks the admission discharged, and records the
   discharge report fields (status, location, notes, report-sent date) captured at the same moment —
   migration 0057. Who discharged the client is admissions.updated_by, set here; app.discharge_log
   resolves it to a name.';

grant execute on function app.finalise_discharge(uuid, text, timestamptz, text, text, text, text, date) to authenticated;

create or replace function public.finalise_discharge(
  p_admission_id        uuid,
  p_discharge_type      text,
  p_actual_discharge_at timestamptz,
  p_reason              text,
  p_report_status       text default null,
  p_location            text default null,
  p_notes               text default null,
  p_report_sent_at      date default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.finalise_discharge(
    p_admission_id, p_discharge_type, p_actual_discharge_at, p_reason,
    p_report_status, p_location, p_notes, p_report_sent_at
  );
$$;

grant execute on function public.finalise_discharge(uuid, text, timestamptz, text, text, text, text, date) to authenticated;

-- ─── discharge_log: the data behind the new Discharge nav section ──────────────────────────────────
--
-- Same gating and inline-join approach as app.client_admission_history (migration 0029): staff labels
-- and the discharging staff's name are facts about the ADMISSION, resolved inline via this
-- security-definer function rather than requiring a separate name-lookup RPC per row.

create or replace function app.discharge_log(p_centre_id uuid)
returns table (
  admission_id             uuid,
  client_id                uuid,
  client_reference         text,
  client_name              text,
  admitted_at              timestamptz,
  actual_discharge_at      timestamptz,
  discharge_type           text,
  discharge_report_status  text,
  discharge_location       text,
  discharge_notes          text,
  discharge_report_sent_at date,
  discharged_by_name       text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Same nulling rule as app.client_summary (migration 0028): a caller who can only see that a client
  -- exists (clients.view_operational), not who they are, still gets the row — reference and every
  -- discharge-report field — just not a name. The frontend falls back to showing the reference alone,
  -- same as it already does wherever client_summary feeds it.
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
      a.actual_discharge_at,
      a.discharge_type,
      a.discharge_report_status,
      a.discharge_location,
      a.discharge_notes,
      a.discharge_report_sent_at,
      up.display_name
    from public.admissions a
    join public.clients c on c.id = a.client_id
    left join public.user_profiles up on up.id = a.updated_by
    where a.centre_id = p_centre_id and a.status = 'discharged'
    order by a.actual_discharge_at desc nulls last;
end;
$$;

comment on function app.discharge_log is
  'Every discharged admission at one centre, most recent first — the data behind the Discharge nav
   section. Requires clients.view_operational or clients.view_identity, and centre access, mirroring
   app.client_admission_history.';

create or replace function public.discharge_log(p_centre_id uuid)
returns table (
  admission_id             uuid,
  client_id                uuid,
  client_reference         text,
  client_name              text,
  admitted_at              timestamptz,
  actual_discharge_at      timestamptz,
  discharge_type           text,
  discharge_report_status  text,
  discharge_location       text,
  discharge_notes          text,
  discharge_report_sent_at date,
  discharged_by_name       text
)
language sql
security invoker
set search_path = ''
as $$
  select * from app.discharge_log(p_centre_id);
$$;

comment on function public.discharge_log is
  'Thin PostgREST-visible wrapper over app.discharge_log. All checks and logic live in the app schema.';

grant execute on function app.discharge_log(uuid) to authenticated;
grant execute on function public.discharge_log(uuid) to authenticated;
