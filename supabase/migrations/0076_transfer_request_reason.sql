-- 0076 · Collect the structured Reason/Sub Reason at request time for Transfer
--
-- Mirrors 0073's early-discharge pattern for Transfer: the reason is given at REQUEST time
-- (request_transfer_discharge), carried on discharge_requests, and finalise_discharge already
-- sources discharge_reason/discharge_sub_reason from the approved request for any non-planned type
-- (0073) — no change needed there.
--
-- Reason is which clinic the client is going to — free text here, not re-validated against a fixed
-- list of centres, because the group's known centre list is UI/display data (centres-data.ts), not a
-- table of real centres; only Primrose Lodge exists as a real `centres` row today. Sub Reason is a
-- fixed 3-item taxonomy, validated the same way early discharge's is.

drop function if exists app.request_transfer_discharge(uuid, text, text, text, integer);
drop function if exists public.request_transfer_discharge(uuid, text, text, text, integer);

create or replace function app.request_transfer_discharge(
  p_admission_id          uuid,
  p_reason                text,
  p_destination           text,
  p_treatment_type        text,
  p_duration_days         integer,
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

  if v_reason is null then
    raise exception 'A reason is required to request a transfer' using errcode = '22023';
  end if;

  p_discharge_reason     := nullif(btrim(coalesce(p_discharge_reason, '')), '');
  p_discharge_sub_reason := nullif(btrim(coalesce(p_discharge_sub_reason, '')), '');

  if p_discharge_sub_reason is not null and p_discharge_sub_reason not in (
    'High Level of Detox required', 'Unhappy with the current service', 'Secondary Care with Providence'
  ) then
    raise exception 'Not a valid sub reason for a transfer: %', p_discharge_sub_reason using errcode = '22023';
  end if;

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be transferred' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.discharge_requests
    where admission_id = p_admission_id and status = 'pending'
  ) then
    raise exception 'A discharge request is already pending for this admission' using errcode = '23505';
  end if;

  insert into public.discharge_requests
    (admission_id, centre_id, discharge_type, reason, requested_by,
     transfer_destination, transfer_treatment_type, transfer_duration_days,
     discharge_reason, discharge_sub_reason)
  values
    (p_admission_id, v_adm.centre_id, 'transfer', v_reason, auth.uid(),
     nullif(btrim(coalesce(p_destination, '')), ''),
     nullif(btrim(coalesce(p_treatment_type, '')), ''),
     p_duration_days,
     p_discharge_reason, p_discharge_sub_reason)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.request_transfer_discharge(
  p_admission_id          uuid,
  p_reason                text,
  p_destination           text,
  p_treatment_type        text,
  p_duration_days         integer,
  p_discharge_reason       text default null,
  p_discharge_sub_reason   text default null
)
returns uuid
language sql security invoker set search_path = ''
as $$
  select app.request_transfer_discharge(
    p_admission_id, p_reason, p_destination, p_treatment_type, p_duration_days,
    p_discharge_reason, p_discharge_sub_reason
  );
$$;

grant execute on function app.request_transfer_discharge(uuid, text, text, text, integer, text, text)    to authenticated;
grant execute on function public.request_transfer_discharge(uuid, text, text, text, integer, text, text) to authenticated;

comment on function app.request_transfer_discharge is
  'Variant of app.request_early_discharge for transfer type — also records destination, treatment '
  'type, expected duration, and a structured Reason (destination clinic, free text) / Sub Reason '
  '(fixed 3-item taxonomy, validated here). Requires discharge.initiate. Migration 0076.';
