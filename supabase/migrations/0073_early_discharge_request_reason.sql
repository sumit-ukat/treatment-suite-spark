-- 0073 · Collect the structured Reason/Sub Reason at request time for Early Discharged
--
-- 0072 validated discharge_reason/discharge_sub_reason inside finalise_discharge, but an early
-- discharge is a two-step workflow: the reason is actually given at REQUEST time
-- (request_early_discharge), days before someone with finalise permission ever sees the admission
-- again — by the finalise step, only the report fields (status/location/referral/notes) are asked
-- for. Re-asking for Reason/Sub Reason at finalise would either duplicate data entry or (worse) let
-- someone finalise with a different reason than what was actually approved.
--
-- This moves reason/sub-reason capture+validation to request_early_discharge (where the discharge
-- form's Reason fields already live), stores them on discharge_requests, and has finalise_discharge
-- carry them over automatically from the approved request — the finalising person never re-enters
-- them. 'other' and 'transfer' requests still carry the columns (nullable) but aren't validated
-- against a taxonomy yet, same as before.

alter table public.discharge_requests
  add column discharge_reason text,
  add column discharge_sub_reason text;

comment on column public.discharge_requests.discharge_reason is
  'Structured reason, validated against a fixed taxonomy for an early-discharge request by '
  'request_early_discharge. Carried over verbatim to admissions.discharge_reason when finalised. '
  'Migration 0073.';
comment on column public.discharge_requests.discharge_sub_reason is
  'Structured sub-reason, cascading from discharge_reason. Migration 0073.';

drop function if exists app.request_early_discharge(uuid, text, text);
drop function if exists public.request_early_discharge(uuid, text, text);

create or replace function app.request_early_discharge(
  p_admission_id          uuid,
  p_discharge_type        text,
  p_reason                text,
  p_discharge_reason       text default null,
  p_discharge_sub_reason   text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm    public.admissions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if not app.has_permission('discharge.initiate') then
    raise exception 'Not permitted to initiate a discharge' using errcode = '42501';
  end if;

  if p_discharge_type not in ('early', 'transfer', 'other') then
    raise exception 'Not a request-requiring discharge type: %', p_discharge_type using errcode = '22023';
  end if;

  if v_reason is null then
    raise exception 'A reason is required to request a discharge' using errcode = '22023';
  end if;

  p_discharge_reason     := nullif(btrim(coalesce(p_discharge_reason, '')), '');
  p_discharge_sub_reason := nullif(btrim(coalesce(p_discharge_sub_reason, '')), '');

  if p_discharge_type = 'early' then
    if p_discharge_reason is null then
      raise exception 'A reason is required for an early discharge' using errcode = '22023';
    end if;

    if p_discharge_reason = 'Self Discharged' then
      if p_discharge_sub_reason is null or p_discharge_sub_reason not in (
        'Against Clinical Advice', 'Personal Reasons', 'Family Emergency', 'Lack of Motivation',
        'Cravings / Relapse Intention', 'Homesickness or isolation'
      ) then
        raise exception 'Not a valid sub reason for Self Discharged: %', p_discharge_sub_reason using errcode = '22023';
      end if;

    elsif p_discharge_reason = 'Medical / Treatment Discharged' then
      if p_discharge_sub_reason is null or p_discharge_sub_reason not in (
        'Non-compliance with Treatment', 'Failed Substance Test', 'Behavioural Issues - Risk to Others',
        'Psychiatric Needs - Needs a higher level of treatment setting', 'Psychiatric Needs - High Suicidal Risk',
        'Psychiatric Needs - High-Level Mental Health Diagnosis', 'Psychiatric Needs - Communication needs',
        'Psychiatric Needs - Other Cognitive Function', 'Physical Needs - self-care/mobility',
        'Physical Needs - risk of infection', 'Physical Needs - cardiac risks'
      ) then
        raise exception 'Not a valid sub reason for Medical / Treatment Discharged: %', p_discharge_sub_reason using errcode = '22023';
      end if;

    else
      raise exception 'Not a valid reason for an early discharge: %', p_discharge_reason using errcode = '22023';
    end if;
  end if;
  -- transfer / other: discharge_reason/discharge_sub_reason stored as given, unvalidated — no
  -- taxonomy defined for them yet.

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be discharged' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.discharge_requests
    where admission_id = p_admission_id and status = 'pending'
  ) then
    raise exception 'A discharge request is already pending for this admission' using errcode = '23505';
  end if;

  insert into public.discharge_requests
    (admission_id, centre_id, discharge_type, reason, requested_by, discharge_reason, discharge_sub_reason)
  values
    (p_admission_id, v_adm.centre_id, p_discharge_type, v_reason, auth.uid(), p_discharge_reason, p_discharge_sub_reason)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.request_early_discharge(
  p_admission_id          uuid,
  p_discharge_type        text,
  p_reason                text,
  p_discharge_reason       text default null,
  p_discharge_sub_reason   text default null
)
returns uuid
language sql security invoker set search_path = ''
as $$
  select app.request_early_discharge(p_admission_id, p_discharge_type, p_reason, p_discharge_reason, p_discharge_sub_reason);
$$;

grant execute on function app.request_early_discharge(uuid, text, text, text, text)    to authenticated;
grant execute on function public.request_early_discharge(uuid, text, text, text, text) to authenticated;

-- Now make finalise_discharge source discharge_reason/discharge_sub_reason from the approved request
-- for non-planned types, rather than trusting whatever (if anything) the finalise-step call passes —
-- the finalising person never re-enters them, so what was actually approved is what gets stored.
drop function if exists app.finalise_discharge(
  uuid, text, timestamptz, text, text, text, text, date, uuid, text, text
);
drop function if exists public.finalise_discharge(
  uuid, text, timestamptz, text, text, text, text, date, uuid, text, text
);

create or replace function app.finalise_discharge(
  p_admission_id          uuid,
  p_discharge_type        text,
  p_actual_discharge_at   timestamptz,
  p_reason                text,
  p_report_status         text default null,
  p_location               text default null,
  p_notes                  text default null,
  p_report_sent_at         date default null,
  p_referral_partner_id    uuid default null,
  p_discharge_reason       text default null,
  p_discharge_sub_reason   text default null
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

  if p_discharge_type = 'planned' then
    -- Graduated: exactly one valid reason, no sub-reason, given directly at finalise time (no
    -- approval step exists for 'planned'). Defaulted rather than demanded — the UI shows it as a
    -- fixed confirmation line, not a choice, so there's nothing to get wrong here.
    p_discharge_reason := coalesce(nullif(btrim(coalesce(p_discharge_reason, '')), ''), 'Completed Treatment');
    if p_discharge_reason <> 'Completed Treatment' then
      raise exception 'Not a valid reason for a planned discharge: %', p_discharge_reason using errcode = '22023';
    end if;
    p_discharge_sub_reason := null;
  end if;
  -- early / transfer / other: p_discharge_reason / p_discharge_sub_reason as passed here are ignored
  -- below — sourced from the approved request instead (set once, at request time).

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

    -- What was actually requested and approved is what gets stored — not whatever (if anything) this
    -- call happened to pass in for these two params.
    p_discharge_reason := v_req.discharge_reason;
    p_discharge_sub_reason := v_req.discharge_sub_reason;
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
         discharge_reason         = p_discharge_reason,
         discharge_sub_reason     = p_discharge_sub_reason,
         updated_by               = auth.uid()
   where id = p_admission_id;
end;
$$;

create or replace function public.finalise_discharge(
  p_admission_id          uuid,
  p_discharge_type        text,
  p_actual_discharge_at   timestamptz,
  p_reason                text,
  p_report_status         text default null,
  p_location               text default null,
  p_notes                  text default null,
  p_report_sent_at         date default null,
  p_referral_partner_id    uuid default null,
  p_discharge_reason       text default null,
  p_discharge_sub_reason   text default null
)
returns void
language sql security invoker set search_path = ''
as $$
  select app.finalise_discharge(
    p_admission_id, p_discharge_type, p_actual_discharge_at, p_reason,
    p_report_status, p_location, p_notes, p_report_sent_at, p_referral_partner_id,
    p_discharge_reason, p_discharge_sub_reason
  );
$$;

grant execute on function app.finalise_discharge(uuid, text, timestamptz, text, text, text, text, date, uuid, text, text)    to authenticated;
grant execute on function public.finalise_discharge(uuid, text, timestamptz, text, text, text, text, date, uuid, text, text) to authenticated;

comment on function app.finalise_discharge is
  'Finalises an approved (or, for planned, immediate) discharge. For early/transfer/other, '
  'discharge_reason/discharge_sub_reason are sourced from the approved discharge_requests row, '
  'ignoring whatever this call itself passes for them. For planned, they are validated here '
  'directly (only one valid reason, no sub-reason — no approval step exists for planned). '
  'Requires discharge.finalise permission. Migration 0073.';
