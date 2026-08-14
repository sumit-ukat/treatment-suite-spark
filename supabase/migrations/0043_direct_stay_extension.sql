-- 0043 · Direct stay extension — no second-person approval required
--
-- Replaces the two-step request→approve flow (0036) with a single action.
-- Any user holding extension.initiate can now extend a stay immediately.
-- The extension record is written as status='approved' in the same transaction
-- that updates the admission's planned discharge date, preserving the full
-- audit trail without the approval gate.
--
-- The old RPCs (request_stay_extension, decide_stay_extension) are left intact
-- for backward compatibility with any in-flight pending rows in production.
-- The app no longer calls them.

create or replace function app.apply_stay_extension(
  p_admission_id    uuid,
  p_additional_days integer,
  p_reason          text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm    public.admissions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_orig   date;
  v_new    date;
  v_id     uuid;
begin
  if not app.has_permission('extension.initiate') then
    raise exception 'Not permitted to extend a stay' using errcode = '42501';
  end if;

  if coalesce(p_additional_days, 0) < 1 then
    raise exception 'Additional days must be at least 1' using errcode = '22023';
  end if;

  if v_reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be extended' using errcode = '22023';
  end if;

  v_orig := v_adm.current_planned_discharge_date;
  v_new  := v_orig + p_additional_days;

  -- Written directly as approved — decided_at/decided_by are set to the same
  -- user since there is no separate approver in this flow.
  insert into public.admission_extensions
    (admission_id, centre_id, original_discharge_date, additional_days, new_discharge_date,
     reason, status, requested_by, decided_at, decided_by)
  values
    (p_admission_id, v_adm.centre_id, v_orig, p_additional_days, v_new,
     v_reason, 'approved', auth.uid(), pg_catalog.now(), auth.uid())
  returning id into v_id;

  update public.admissions
     set current_planned_discharge_date = v_new,
         updated_by                     = auth.uid()
   where id = p_admission_id;

  return v_id;
end;
$$;

comment on function app.apply_stay_extension is
  'Extends a client''s planned stay immediately — no second-person approval. Requires extension.initiate. Writes an approved extension record and updates admissions.current_planned_discharge_date in one transaction.';

create or replace function public.apply_stay_extension(
  p_admission_id uuid, p_additional_days integer, p_reason text
)
returns uuid
language sql security invoker set search_path = ''
as $$ select app.apply_stay_extension(p_admission_id, p_additional_days, p_reason); $$;

grant execute on function app.apply_stay_extension(uuid, integer, text)    to authenticated;
grant execute on function public.apply_stay_extension(uuid, integer, text) to authenticated;
