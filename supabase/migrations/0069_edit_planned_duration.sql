-- 0069 · Make the programme length (planned_duration) editable post-admission
--
-- Today planned_duration/planned_duration_unit are set once at admission (app.admit_client) and
-- never editable afterward — the only post-admission lever is "Extend stay" (apply_stay_extension),
-- which only ever adds days on top of the current plan and refuses a non-positive amount. That
-- doesn't cover correcting the original programme length itself (e.g. it was entered as 21 days but
-- should have been 28), which needs to be able to move the discharge date earlier as well as later.
--
-- Extends update_admission_details with an optional new planned_duration/unit. When provided, updates
-- the stored duration and recomputes current_planned_discharge_date via calculate_planned_discharge —
-- the same engine extension/admission already use. original_planned_discharge_date is left untouched;
-- it is the historical record of what was planned at admission, same as an extension leaves it alone.

drop function if exists app.update_admission_details(
  uuid, text, text, text, text, text, boolean, text, date
);
drop function if exists public.update_admission_details(
  uuid, text, text, text, text, text, boolean, text, date
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
  p_planned_duration_unit  text default null
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
  p_planned_duration_unit  text default null
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
    p_planned_duration_unit
  );
$$;

grant execute on function app.update_admission_details(uuid, text, text, text, text, text, boolean, text, date, integer, text)    to authenticated;
grant execute on function public.update_admission_details(uuid, text, text, text, text, text, boolean, text, date, integer, text) to authenticated;

comment on function app.update_admission_details is
  'Edit care-team (incl. doctor), treatment group, substance, PEEP flag, detox-ends date and '
  'programme length post-admission. Staff assignments are rotated (old row closed, new row '
  'inserted) so the full history is preserved. A changed planned_duration/unit recomputes only '
  'current_planned_discharge_date (original_planned_discharge_date is left as the historical record '
  'of what was planned at admission, same as a stay extension leaves it). Requires admissions.edit '
  'permission. Migration 0069 added planned_duration/planned_duration_unit.';
