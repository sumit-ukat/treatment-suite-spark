-- 0066 · Referral partner directory
--
-- Replaces the centre's manual "Options" tab (a flat list of secondary-treatment/housing partners —
-- name, type, location, website, phone, contact) that the discharge workflow could previously only
-- reference as free text in discharge_location. A discharge can now optionally link to a real,
-- structured partner record instead of (or alongside) typing its name into that free-text field.

create table public.referral_partners (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name            text not null,
  partner_type    text,
  location        text,
  website         text,
  phone           text,
  contact_email   text,
  contact_name    text,
  contact_role    text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id)
);

comment on table public.referral_partners is
  'Secondary-treatment/housing/support organisations a client can be referred to on discharge —
   replaces the centre''s manual "Options" directory sheet. Migration 0066.';

alter table public.referral_partners enable row level security;

-- Same shape as substances_read (migration 0007): visible to anyone who can access a centre in the
-- same organisation, not centre-scoped itself since a partner org isn't tied to one centre.
create policy referral_partners_read on public.referral_partners for select to authenticated
  using (exists (
    select 1 from public.centres c
     where c.organisation_id = referral_partners.organisation_id
       and app.can_access_centre(c.id)
  ));

-- Anyone who can initiate or finalise a discharge can add a partner on the fly (the discharge dialog
-- is where a missing one would first be noticed); only administration can edit or deactivate one
-- afterward, since by then other discharges may already reference it.
create policy referral_partners_insert on public.referral_partners for insert to authenticated
  with check (
    (app.has_permission('discharge.initiate') or app.has_permission('discharge.finalise'))
    and exists (
      select 1 from public.centres c
       where c.organisation_id = referral_partners.organisation_id
         and app.can_access_centre(c.id)
    )
  );

create policy referral_partners_update on public.referral_partners for update to authenticated
  using (app.has_permission('administration.manage_users'))
  with check (app.has_permission('administration.manage_users'));

grant select, insert on public.referral_partners to authenticated;
grant update on public.referral_partners to authenticated;

alter table public.admissions
  add column if not exists referral_partner_id uuid references public.referral_partners(id);

-- ─── finalise_discharge: accept an optional referral partner alongside the existing report fields ──

drop function if exists app.finalise_discharge(uuid, text, timestamptz, text, text, text, text, date);
drop function if exists public.finalise_discharge(uuid, text, timestamptz, text, text, text, text, date);

create or replace function app.finalise_discharge(
  p_admission_id        uuid,
  p_discharge_type      text,
  p_actual_discharge_at timestamptz,
  p_reason              text,
  p_report_status       text default null,
  p_location            text default null,
  p_notes               text default null,
  p_report_sent_at      date default null,
  p_referral_partner_id uuid default null
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

  if p_referral_partner_id is not null
     and not exists (
       select 1 from public.referral_partners rp
        where rp.id = p_referral_partner_id and rp.organisation_id = v_adm.organisation_id
     )
  then
    raise exception 'Referral partner not found' using errcode = 'P0002';
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
         referral_partner_id      = p_referral_partner_id,
         updated_by               = auth.uid()
   where id = p_admission_id;
end;
$$;

comment on function app.finalise_discharge is
  'Ends the stay: closes the open room allocation, marks the admission discharged, and records the
   discharge report fields (status, location, notes, report-sent date, referral partner) captured at
   the same moment — migrations 0057 and 0066. Who discharged the client is admissions.updated_by, set
   here; app.discharge_log resolves it to a name.';

grant execute on function app.finalise_discharge(uuid, text, timestamptz, text, text, text, text, date, uuid) to authenticated;

create or replace function public.finalise_discharge(
  p_admission_id        uuid,
  p_discharge_type      text,
  p_actual_discharge_at timestamptz,
  p_reason              text,
  p_report_status       text default null,
  p_location            text default null,
  p_notes               text default null,
  p_report_sent_at      date default null,
  p_referral_partner_id uuid default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.finalise_discharge(
    p_admission_id, p_discharge_type, p_actual_discharge_at, p_reason,
    p_report_status, p_location, p_notes, p_report_sent_at, p_referral_partner_id
  );
$$;

grant execute on function public.finalise_discharge(uuid, text, timestamptz, text, text, text, text, date, uuid) to authenticated;

-- ─── discharge_log: surface the linked partner's name alongside the existing free-text location ────

drop function if exists app.discharge_log(uuid);
drop function if exists public.discharge_log(uuid);

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
  discharged_by_name       text,
  referral_partner_name    text
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
      a.actual_discharge_at,
      a.discharge_type,
      a.discharge_report_status,
      a.discharge_location,
      a.discharge_notes,
      a.discharge_report_sent_at,
      up.display_name,
      rp.name
    from public.admissions a
    join public.clients c on c.id = a.client_id
    left join public.user_profiles up on up.id = a.updated_by
    left join public.referral_partners rp on rp.id = a.referral_partner_id
    where a.centre_id = p_centre_id and a.status = 'discharged'
    order by a.actual_discharge_at desc nulls last;
end;
$$;

comment on function app.discharge_log is
  'Every discharged admission at one centre, most recent first — the data behind the Discharge nav
   section. Requires clients.view_operational or clients.view_identity, and centre access, mirroring
   app.client_admission_history. Migration 0066 added referral_partner_name.';

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
  discharged_by_name       text,
  referral_partner_name    text
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
