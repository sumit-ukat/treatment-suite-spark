-- 0071 · A narrow, single-field setter for admissions.care_status
--
-- update_admission_details (0070) already accepts care_status, but it sets treatment_group,
-- primary_substance_id, peep_required and detox_ends unconditionally in the same statement — fine
-- for the full "edit everything" form, which always prefills all of them first, but dangerous for a
-- quick one-field Status picker: calling that RPC with only care_status populated would silently
-- clobber the client's therapist/substance/PEEP/detox fields back to whatever the caller happened to
-- leave blank. This mirrors set_admission_high_risk's shape (0036) instead — touches exactly one
-- column, nothing else, so a Status-only UI can never have that failure mode.

create or replace function app.set_admission_care_status(p_admission_id uuid, p_care_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_centre_id uuid;
begin
  if not app.has_permission('admissions.edit') then
    raise exception 'Not permitted to edit admission details' using errcode = '42501';
  end if;

  p_care_status := nullif(btrim(coalesce(p_care_status, '')), '');
  if p_care_status is not null and p_care_status not in ('graduate', 'discharged', 'extended', 'transferred') then
    raise exception 'Status must be one of graduate, discharged, extended, transferred' using errcode = '22023';
  end if;

  select centre_id into v_centre_id from public.admissions where id = p_admission_id;
  if v_centre_id is null then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;
  if not app.can_access_centre(v_centre_id) then
    raise exception 'Not permitted to access this centre' using errcode = '42501';
  end if;

  update public.admissions
     set care_status = p_care_status,
         updated_by  = auth.uid()
   where id = p_admission_id;
end;
$$;

create or replace function public.set_admission_care_status(p_admission_id uuid, p_care_status text)
returns void
language sql security invoker set search_path = ''
as $$
  select app.set_admission_care_status(p_admission_id, p_care_status);
$$;

grant execute on function app.set_admission_care_status(uuid, text)    to authenticated;
grant execute on function public.set_admission_care_status(uuid, text) to authenticated;

comment on function app.set_admission_care_status is
  'Sets (or clears, with null) only admissions.care_status — nothing else. The quick Status picker '
  'popup uses this instead of update_admission_details so it can never touch other admission fields. '
  'Requires admissions.edit permission. Migration 0071.';
