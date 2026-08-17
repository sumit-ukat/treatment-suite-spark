-- 0047 · Edit admission details post-admission
--
-- Adds update_admission_details so care coordinators can fix or add care-team
-- assignments (focal therapist, buddy, keyworker), treatment group, primary
-- substance and the PEEP flag without creating a new admission.
--
-- Staff assignments are updated by closing any existing open row for the role
-- and inserting a new one, which preserves the full audit history.

create or replace function app.update_admission_details(
  p_admission_id          uuid,
  p_focal_therapist_label text,
  p_buddy_label           text,
  p_key_worker_label      text,
  p_treatment_group       text,
  p_substance_name        text,
  p_peep_required         boolean
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

  -- Normalise: empty strings become null (null = cleared)
  p_focal_therapist_label := nullif(btrim(coalesce(p_focal_therapist_label, '')), '');
  p_buddy_label           := nullif(btrim(coalesce(p_buddy_label, '')), '');
  p_key_worker_label      := nullif(btrim(coalesce(p_key_worker_label, '')), '');
  p_treatment_group       := nullif(btrim(coalesce(p_treatment_group, '')), '');
  p_substance_name        := nullif(btrim(coalesce(p_substance_name, '')), '');

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

  -- Update core admission fields (always: form is pre-filled so values are intentional)
  update public.admissions
     set treatment_group      = p_treatment_group,
         primary_substance_id = v_substance_id,
         peep_required        = p_peep_required,
         updated_by           = auth.uid()
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

end;
$$;

-- PostgREST-visible wrapper (security invoker — RLS applies to the caller, not the function)
create or replace function public.update_admission_details(
  p_admission_id          uuid,
  p_focal_therapist_label text,
  p_buddy_label           text,
  p_key_worker_label      text,
  p_treatment_group       text,
  p_substance_name        text,
  p_peep_required         boolean
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
    p_peep_required
  );
$$;

grant execute on function app.update_admission_details(uuid, text, text, text, text, text, boolean)    to authenticated;
grant execute on function public.update_admission_details(uuid, text, text, text, text, text, boolean) to authenticated;

comment on function app.update_admission_details is
  'Edit care-team, treatment group, substance and PEEP flag post-admission. '
  'Staff assignments are rotated (old row closed, new row inserted) so the full '
  'history is preserved. Requires admission.manage permission.';
