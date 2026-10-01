-- 0072 · Structured Reason / Sub Reason for Graduated and Early Discharged
--
-- The existing "Reason" field on the discharge form is free text and was never actually stored on
-- the admission — finalise_discharge only ever fed it into the audit log (set_config
-- 'app.change_reason'), never a real column. This adds two real, nullable columns
-- (discharge_reason / discharge_sub_reason) and validates them server-side against the centre's
-- fixed taxonomy for 'planned' (Graduated) and 'early' (Early Discharged) discharges — the only two
-- types this covers for now. 'transfer' and 'other' pass the two new fields through unvalidated
-- until a taxonomy for them is defined too.

alter table public.admissions
  add column discharge_reason text,
  add column discharge_sub_reason text;

comment on column public.admissions.discharge_reason is
  'Structured discharge reason (e.g. "Self Discharged"), validated against a fixed taxonomy for '
  'planned/early discharges by finalise_discharge. Null for admissions discharged before this '
  'existed, and currently always null for transfer/other. Migration 0072.';
comment on column public.admissions.discharge_sub_reason is
  'Structured discharge sub-reason, cascading from discharge_reason — the exact set of valid values '
  'depends on which reason was chosen. Migration 0072.';

drop function if exists app.finalise_discharge(
  uuid, text, timestamptz, text, text, text, text, date, uuid
);
drop function if exists public.finalise_discharge(
  uuid, text, timestamptz, text, text, text, text, date, uuid
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

  p_discharge_reason     := nullif(btrim(coalesce(p_discharge_reason, '')), '');
  p_discharge_sub_reason := nullif(btrim(coalesce(p_discharge_sub_reason, '')), '');

  if p_discharge_type = 'planned' then
    -- Graduated: exactly one valid reason, no sub-reason. Defaulted rather than demanded — the UI
    -- shows it as a fixed confirmation line, not a choice, so there's nothing to get wrong here.
    p_discharge_reason := coalesce(p_discharge_reason, 'Completed Treatment');
    if p_discharge_reason <> 'Completed Treatment' then
      raise exception 'Not a valid reason for a planned discharge: %', p_discharge_reason using errcode = '22023';
    end if;
    p_discharge_sub_reason := null;

  elsif p_discharge_type = 'early' then
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
  -- transfer / other: p_discharge_reason / p_discharge_sub_reason pass through unvalidated for now —
  -- no taxonomy defined for them yet.

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
  'Finalises an approved (or, for planned, immediate) discharge. discharge_reason/discharge_sub_reason '
  'are validated against a fixed taxonomy for planned/early discharge types; transfer/other accept '
  'them unvalidated for now. Requires discharge.finalise permission. Migration 0072 added the '
  'reason/sub-reason columns and their validation.';
