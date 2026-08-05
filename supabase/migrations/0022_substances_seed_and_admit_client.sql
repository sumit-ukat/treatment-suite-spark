-- 0022 · Substances seed, and app.admit_client — the trusted admission workflow
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05). Depends on app.calculate_planned_discharge,
-- added in 0023 — apply both together. 14 assertions passing (see 0023 for the verification run).

insert into substances (organisation_id, name)
select id, v.name from organisations o cross join (values ('Alcohol'), ('Cocaine')) as v(name)
where o.slug = 'ukat'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- app.admit_client — the trusted admission workflow.
--
-- Brief section 9 lists nineteen steps and four things the process must prevent. This function is
-- where all of that becomes one atomic unit rather than a sequence of separate client calls a
-- half-finished network request could leave in an inconsistent state:
--
--   * reuse an existing client by id, or create one
--   * validate the bed belongs to this centre, with a clear error ahead of the raw constraint name
--   * compute the planned discharge date
--   * open the room allocation — the exclusion constraint from 0005 is what actually refuses a
--     double-booking, including under concurrency; this function is the friendly error in front of it
--   * generate the admission's tasks
--   * record therapist / buddy / doctor as staff_assignments, unresolved-by-label unless a real
--     user id is supplied later — see OPEN_QUESTIONS Q41
--   * audit_events is written by the existing triggers on clients/admissions/room_allocations/
--     staff_assignments, not duplicated here
--
-- A duplicate active admission is already impossible at the database level via 0004's
-- admissions_one_open_per_client unique index. The check in this function exists only so the error
-- reads clearly instead of as a raw constraint name.
-- ---------------------------------------------------------------------------
create or replace function app.admit_client(
  p_centre_id           uuid,
  p_bed_id              uuid,
  p_admitted_at         timestamptz,
  p_planned_duration    integer,
  p_planned_duration_unit text,
  -- Provide EITHER an existing client, OR both names to create one.
  p_client_id           uuid default null,
  p_first_name          text default null,
  p_last_name           text default null,
  p_preferred_name      text default null,
  p_treatment_group     text default null,
  p_substance_name      text default null,
  p_peep_required       boolean default false,
  p_focal_therapist_label text default null,
  p_buddy_label         text default null,
  p_doctor_label        text default null,
  p_reason              text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org           uuid;
  v_client        uuid;
  v_admission     uuid;
  v_discharge     date;
  v_substance     uuid;
  v_bed_centre    uuid;
  v_open_count    integer;
begin
  if not app.can_access_centre(p_centre_id) then
    raise exception 'Not permitted to admit into this centre' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_permission('admissions.create') then
    raise exception 'Missing permission admissions.create' using errcode = 'insufficient_privilege';
  end if;

  select organisation_id into v_org from public.centres where id = p_centre_id;
  if v_org is null then
    raise exception 'Centre % not found', p_centre_id;
  end if;

  select centre_id into v_bed_centre from public.beds where id = p_bed_id;
  if v_bed_centre is null then
    raise exception 'Bed % not found', p_bed_id;
  end if;
  if v_bed_centre <> p_centre_id then
    raise exception 'Bed does not belong to the selected centre' using errcode = 'foreign_key_violation';
  end if;

  if p_client_id is not null then
    select id into v_client from public.clients where id = p_client_id and organisation_id = v_org;
    if v_client is null then
      raise exception 'Client % not found in this organisation', p_client_id;
    end if;
  else
    if p_first_name is null or p_last_name is null then
      raise exception 'Provide an existing client_id, or both first_name and last_name to create one';
    end if;
    if not app.has_permission('clients.edit_identity') then
      raise exception 'Missing permission clients.edit_identity' using errcode = 'insufficient_privilege';
    end if;
    insert into public.clients (organisation_id, reference, first_name, last_name, preferred_name)
    values (
      v_org,
      -- CL-{8 hex chars}, uppercased. Not clinically meaningful — stable and collision-free without
      -- a sequence to coordinate across centres.
      'CL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      p_first_name, p_last_name, p_preferred_name
    )
    returning id into v_client;
  end if;

  select count(*) into v_open_count from public.admissions
   where client_id = v_client and status in ('planned','active');
  if v_open_count > 0 then
    raise exception 'This client already has an open admission' using errcode = 'unique_violation';
  end if;

  if p_substance_name is not null then
    select id into v_substance from public.substances
     where organisation_id = v_org and name = p_substance_name and is_active;
  end if;

  v_discharge := app.calculate_planned_discharge(p_admitted_at, p_planned_duration, p_planned_duration_unit, p_centre_id);

  insert into public.admissions (
    client_id, centre_id, organisation_id, admitted_at, status,
    planned_duration, planned_duration_unit,
    original_planned_discharge_date, current_planned_discharge_date,
    treatment_group, primary_substance_id, peep_required, created_by
  ) values (
    v_client, p_centre_id, v_org, p_admitted_at, 'active',
    p_planned_duration, p_planned_duration_unit,
    v_discharge, v_discharge,
    p_treatment_group, v_substance, p_peep_required, auth.uid()
  )
  returning id into v_admission;

  -- Either succeeds or raises exclusion_violation — the constraint from 0005 is what actually
  -- prevents double-booking, including under concurrency.
  insert into public.room_allocations (admission_id, bed_id, centre_id, started_at, allocation_reason, allocated_by)
  values (v_admission, p_bed_id, p_centre_id, p_admitted_at,
          coalesce(p_reason, 'Admission'), auth.uid());

  if p_focal_therapist_label is not null then
    insert into public.staff_assignments (admission_id, centre_id, role_code, display_label, started_at, assigned_by)
    values (v_admission, p_centre_id, 'focal_therapist', p_focal_therapist_label, p_admitted_at, auth.uid());
  end if;
  if p_buddy_label is not null then
    insert into public.staff_assignments (admission_id, centre_id, role_code, display_label, started_at, assigned_by)
    values (v_admission, p_centre_id, 'buddy', p_buddy_label, p_admitted_at, auth.uid());
  end if;
  if p_doctor_label is not null then
    insert into public.staff_assignments (admission_id, centre_id, role_code, display_label, started_at, assigned_by)
    values (v_admission, p_centre_id, 'doctor', p_doctor_label, p_admitted_at, auth.uid());
  end if;

  perform app.generate_admission_tasks(v_admission);

  return v_admission;
end;
$$;

grant execute on function app.admit_client(
  uuid, uuid, timestamptz, integer, text, uuid, text, text, text, text, text, boolean, text, text, text, text
) to authenticated;

comment on function app.admit_client is
  'Trusted admission workflow: resolve/create client, allocate bed, assign staff, generate tasks - one transaction, or none of it happens.';
