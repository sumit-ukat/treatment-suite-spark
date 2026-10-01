-- 0070 · Add a manually-set client Status (Graduate / Discharged / Extended / Transferred)
--
-- Distinct from admissions.status ('active'/'discharged', the system lifecycle flag) and
-- discharge_type (only chosen once a discharge is actually finalised) — this is a free-standing
-- label staff set themselves at any point, covering how a client's stay is actually going
-- (e.g. flagging someone as "Extended" or on track to "Graduate" while still admitted, not just
-- after the fact). Nullable: no value means "not set", shown as "—" rather than a guess.

alter table public.admissions
  add column care_status text
  constraint admissions_care_status_check
  check (care_status is null or care_status in ('graduate', 'discharged', 'extended', 'transferred'));

comment on column public.admissions.care_status is
  'Staff-set status label (graduate/discharged/extended/transferred), independent of the '
  'lifecycle status and discharge_type columns. Null means not set. Migration 0070.';

-- Extend update_admission_details with the new field, same direct-set pattern as treatment_group /
-- detox_ends (not coalesce — this field is submitted with every save of that form, same as those).
drop function if exists app.update_admission_details(
  uuid, text, text, text, text, text, boolean, text, date, integer, text
);
drop function if exists public.update_admission_details(
  uuid, text, text, text, text, text, boolean, text, date, integer, text
);

create or replace function app.update_admission_details(
  p_admission_id           uuid,
  p_focal_therapist_label  text,
  p_buddy_label            text,
  p_key_worker_label       text,
  p_treatment_group        text,
  p_substance_name         text,
  p_peep_required          boolean,
  p_doctor_label           text default null,
  p_detox_ends             date default null,
  p_planned_duration       integer default null,
  p_planned_duration_unit  text default null,
  p_care_status            text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admission    public.admissions;
  v_substance_id uuid;
  v_cur_label    text;
  v_new_planned  date;
begin
  if not app.has_permission('admissions.edit') then
    raise exception 'Not permitted to edit admission details' using errcode = '42501';
  end if;

  select * into v_admission from public.admissions where id = p_admission_id;
  if v_admission.id is null then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;
  if not app.can_access_centre(v_admission.centre_id) then
    raise exception 'Not permitted to access this centre' using errcode = '42501';
  end if;

  if p_planned_duration is not null or p_planned_duration_unit is not null then
    if p_planned_duration is null or p_planned_duration <= 0 then
      raise exception 'Programme length must be a positive whole number' using errcode = '22023';
    end if;
    if p_planned_duration_unit not in ('days', 'weeks') then
      raise exception 'Programme length unit must be days or weeks' using errcode = '22023';
    end if;
  end if;

  -- Normalise: empty strings become null (null = cleared)
  p_focal_therapist_label := nullif(btrim(coalesce(p_focal_therapist_label, '')), '');
  p_buddy_label           := nullif(btrim(coalesce(p_buddy_label, '')), '');
  p_key_worker_label      := nullif(btrim(coalesce(p_key_worker_label, '')), '');
  p_treatment_group       := nullif(btrim(coalesce(p_treatment_group, '')), '');
  p_substance_name        := nullif(btrim(coalesce(p_substance_name, '')), '');
  p_doctor_label          := nullif(btrim(coalesce(p_doctor_label, '')), '');
  p_care_status           := nullif(btrim(coalesce(p_care_status, '')), '');

  if p_care_status is not null and p_care_status not in ('graduate', 'discharged', 'extended', 'transferred') then
    raise exception 'Status must be one of graduate, discharged, extended, transferred' using errcode = '22023';
  end if;

  -- Resolve substance: look up by name, create if not found, clear if null
  if p_substance_name is not null then
    select id into v_substance_id
      from public.substances
     where organisation_id = v_admission.organisation_id
       and lower(name) = lower(p_substance_name)
     limit 1;
    if v_substance_id is null then
      insert into public.substances (organisation_id, name)
      values (v_admission.organisation_id, p_substance_name)
      returning id into v_substance_id;
    end if;
  end if;

  if p_planned_duration is not null then
    v_new_planned := app.calculate_planned_discharge(
      v_admission.admitted_at, p_planned_duration, p_planned_duration_unit, v_admission.centre_id
    );
  end if;

  -- Update core admission fields (always: form is pre-filled so values are intentional)
  update public.admissions
     set treatment_group              = p_treatment_group,
         primary_substance_id         = v_substance_id,
         peep_required                = p_peep_required,
         detox_ends                   = p_detox_ends,
         care_status                  = p_care_status,
         planned_duration             = coalesce(p_planned_duration, planned_duration),
         planned_duration_unit        = coalesce(p_planned_duration_unit, planned_duration_unit),
         current_planned_discharge_date = coalesce(v_new_planned, current_planned_discharge_date),
         updated_by                   = auth.uid()
   where id = p_admission_id;

  -- ── focal_therapist ────────────────────────────────────────────────────────
  select display_label into v_cur_label
    from public.staff_assignments
   where admission_id = p_admission_id and role_code = 'focal_therapist' and ended_at is null
   limit 1;
  if v_cur_label is distinct from p_focal_therapist_label then
    update public.staff_assignments
       set ended_at = now()
     where admission_id = p_admission_id and role_code = 'focal_therapist' and ended_at is null;
    if p_focal_therapist_label is not null then
      insert into public.staff_assignments
        (admission_id, centre_id, role_code, assignee_kind, display_label, assigned_by)
      values
        (p_admission_id, v_admission.centre_id, 'focal_therapist', 'unresolved', p_focal_therapist_label, auth.uid());
    end if;
  end if;

  -- ── buddy ──────────────────────────────────────────────────────────────────
  select display_label into v_cur_label
    from public.staff_assignments
   where admission_id = p_admission_id and role_code = 'buddy' and ended_at is null
   limit 1;
  if v_cur_label is distinct from p_buddy_label then
    update public.staff_assignments
       set ended_at = now()
     where admission_id = p_admission_id and role_code = 'buddy' and ended_at is null;
    if p_buddy_label is not null then
      insert into public.staff_assignments
        (admission_id, centre_id, role_code, assignee_kind, display_label, assigned_by)
      values
        (p_admission_id, v_admission.centre_id, 'buddy', 'unresolved', p_buddy_label, auth.uid());
    end if;
  end if;

  -- ── key_worker ─────────────────────────────────────────────────────────────
  select display_label into v_cur_label
    from public.staff_assignments
   where admission_id = p_admission_id and role_code = 'key_worker' and ended_at is null
   limit 1;
  if v_cur_label is distinct from p_key_worker_label then
    update public.staff_assignments
       set ended_at = now()
     where admission_id = p_admission_id and role_code = 'key_worker' and ended_at is null;
    if p_key_worker_label is not null then
      insert into public.staff_assignments
        (admission_id, centre_id, role_code, assignee_kind, display_label, assigned_by)
      values
        (p_admission_id, v_admission.centre_id, 'key_worker', 'unresolved', p_key_worker_label, auth.uid());
    end if;
  end if;

  -- ── doctor ─────────────────────────────────────────────────────────────────
  select display_label into v_cur_label
    from public.staff_assignments
   where admission_id = p_admission_id and role_code = 'doctor' and ended_at is null
   limit 1;
  if v_cur_label is distinct from p_doctor_label then
    update public.staff_assignments
       set ended_at = now()
     where admission_id = p_admission_id and role_code = 'doctor' and ended_at is null;
    if p_doctor_label is not null then
      insert into public.staff_assignments
        (admission_id, centre_id, role_code, assignee_kind, display_label, assigned_by)
      values
        (p_admission_id, v_admission.centre_id, 'doctor', 'unresolved', p_doctor_label, auth.uid());
    end if;
  end if;

end;
$$;

-- PostgREST-visible wrapper (security invoker — RLS applies to the caller, not the function)
create or replace function public.update_admission_details(
  p_admission_id           uuid,
  p_focal_therapist_label  text,
  p_buddy_label            text,
  p_key_worker_label       text,
  p_treatment_group        text,
  p_substance_name         text,
  p_peep_required          boolean,
  p_doctor_label           text default null,
  p_detox_ends             date default null,
  p_planned_duration       integer default null,
  p_planned_duration_unit  text default null,
  p_care_status            text default null
)
returns void
language sql security invoker set search_path = ''
as $$
  select app.update_admission_details(
    p_admission_id,
    p_focal_therapist_label,
    p_buddy_label,
    p_key_worker_label,
    p_treatment_group,
    p_substance_name,
    p_peep_required,
    p_doctor_label,
    p_detox_ends,
    p_planned_duration,
    p_planned_duration_unit,
    p_care_status
  );
$$;

grant execute on function app.update_admission_details(uuid, text, text, text, text, text, boolean, text, date, integer, text, text)    to authenticated;
grant execute on function public.update_admission_details(uuid, text, text, text, text, text, boolean, text, date, integer, text, text) to authenticated;

comment on function app.update_admission_details is
  'Edit care-team (incl. doctor), treatment group, substance, PEEP flag, detox-ends date, '
  'programme length and Status post-admission. Staff assignments are rotated (old row closed, '
  'new row inserted) so the full history is preserved. Requires admissions.edit permission. '
  'Migration 0070 added care_status.';

-- Surface care_status on the Discharge Log too.
drop function if exists app.discharge_log(uuid);
drop function if exists public.discharge_log(uuid);

create or replace function app.discharge_log(p_centre_id uuid)
returns table(
  admission_id uuid, client_id uuid, client_reference text, client_name text,
  admitted_at timestamptz, actual_discharge_at timestamptz, discharge_type text,
  discharge_report_status text, discharge_location text, discharge_notes text,
  discharge_report_sent_at date, discharged_by_name text, referral_partner_name text,
  care_status text
)
language plpgsql
stable security definer
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
      rp.name,
      a.care_status
    from public.admissions a
    join public.clients c on c.id = a.client_id
    left join public.user_profiles up on up.id = a.updated_by
    left join public.referral_partners rp on rp.id = a.referral_partner_id
    where a.centre_id = p_centre_id and a.status = 'discharged'
    order by a.actual_discharge_at desc nulls last;
end;
$$;

create or replace function public.discharge_log(p_centre_id uuid)
returns table(
  admission_id uuid, client_id uuid, client_reference text, client_name text,
  admitted_at timestamptz, actual_discharge_at timestamptz, discharge_type text,
  discharge_report_status text, discharge_location text, discharge_notes text,
  discharge_report_sent_at date, discharged_by_name text, referral_partner_name text,
  care_status text
)
language sql security invoker set search_path = ''
as $$
  select * from app.discharge_log(p_centre_id);
$$;

grant execute on function app.discharge_log(uuid)    to authenticated;
grant execute on function public.discharge_log(uuid) to authenticated;
