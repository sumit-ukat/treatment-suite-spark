-- 0055 · Kipu No. replaces the auto-generated client reference
--
-- Every new client's `clients.reference` was auto-generated as a random `CL-XXXXXXXX` code
-- (migration 0022), meaningless to staff and disconnected from Kipu, the external case-management
-- system centres actually look clients up in. `reference` is already the one identifier shown
-- everywhere in the app — the client directory, the board's client cell, the client file panel's
-- "Ref ..." line — so nothing downstream needs to change; only how it gets its value at admission does.
--
-- `p_kipu_no` is required (not optional) when creating a new client — re-admitting an existing client
-- reuses their existing reference and does not need it. The existing `unique (organisation_id,
-- reference)` constraint from migration 0004 naturally rejects a duplicate Kipu No. with no extra code
-- needed here.
--
-- Based on 0053's admit_client (the latest prior definition — 0038's is superseded), with p_kipu_no
-- appended as a new 22nd parameter and the client-creation insert changed to use it.

drop function if exists app.admit_client(
  uuid, uuid, timestamptz, integer, text, uuid, text, text, text, text, text,
  boolean, text, text, text, text, boolean, text, text, date, text[]
);
drop function if exists public.admit_client(
  uuid, uuid, timestamptz, integer, text, uuid, text, text, text, text, text,
  boolean, text, text, text, text, boolean, text, text, date, text[]
);

create or replace function app.admit_client(
  p_centre_id             uuid,
  p_bed_id                uuid,
  p_admitted_at           timestamptz,
  p_planned_duration      integer,
  p_planned_duration_unit text,
  p_client_id             uuid      default null,
  p_first_name            text      default null,
  p_last_name             text      default null,
  p_preferred_name        text      default null,
  p_treatment_group       text      default null,
  p_substance_name        text      default null,
  p_peep_required         boolean   default false,
  p_focal_therapist_label text      default null,
  p_buddy_label           text      default null,
  p_doctor_label          text      default null,
  p_reason                text      default null,
  p_high_risk             boolean   default false,
  p_safeguarding_notes    text      default null,
  p_peeps_label           text      default null,
  p_detox_ends            date      default null,
  p_programme_modules     text[]    default array['contact','survey','familyvisit','lifestep','careplan'],
  p_kipu_no               text      default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org        uuid;
  v_client     uuid;
  v_admission  uuid;
  v_discharge  date;
  v_substance  uuid;
  v_bed_centre uuid;
  v_open_count integer;
  v_kipu_no    text := nullif(btrim(coalesce(p_kipu_no, '')), '');
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
    if v_kipu_no is null then
      raise exception 'Kipu No. is required to create a new client';
    end if;
    insert into public.clients (organisation_id, reference, first_name, last_name, preferred_name)
    values (v_org, v_kipu_no, p_first_name, p_last_name, p_preferred_name)
    returning id into v_client;
  end if;

  select count(*) into v_open_count from public.admissions
   where client_id = v_client and status in ('planned', 'active');
  if v_open_count > 0 then
    raise exception 'This client already has an open admission' using errcode = 'unique_violation';
  end if;

  if p_substance_name is not null then
    select id into v_substance from public.substances
     where organisation_id = v_org and name = p_substance_name and is_active;
  end if;

  v_discharge := app.calculate_planned_discharge(
    p_admitted_at, p_planned_duration, p_planned_duration_unit, p_centre_id
  );

  insert into public.admissions (
    client_id, centre_id, organisation_id, admitted_at, status,
    planned_duration, planned_duration_unit,
    original_planned_discharge_date, current_planned_discharge_date,
    treatment_group, primary_substance_id, peep_required, high_risk, created_by,
    detox_ends, programme_modules
  ) values (
    v_client, p_centre_id, v_org, p_admitted_at, 'active',
    p_planned_duration, p_planned_duration_unit,
    v_discharge, v_discharge,
    p_treatment_group, v_substance, p_peep_required, p_high_risk, auth.uid(),
    p_detox_ends,
    coalesce(p_programme_modules, array['contact','survey','familyvisit','lifestep','careplan'])
  )
  returning id into v_admission;

  insert into public.room_allocations (
    admission_id, bed_id, centre_id, started_at, allocation_reason, allocated_by
  ) values (
    v_admission, p_bed_id, p_centre_id, p_admitted_at, coalesce(p_reason, 'Admission'), auth.uid()
  );

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
  if p_peeps_label is not null then
    insert into public.staff_assignments (admission_id, centre_id, role_code, display_label, started_at, assigned_by)
    values (v_admission, p_centre_id, 'peeps', p_peeps_label, p_admitted_at, auth.uid());
  end if;

  perform app.generate_admission_tasks(v_admission);

  if p_safeguarding_notes is not null and char_length(trim(p_safeguarding_notes)) > 0 then
    insert into public.client_concerns (
      client_id, admission_id, centre_id, note, category, logged_by
    ) values (
      v_client, v_admission, p_centre_id,
      trim(p_safeguarding_notes), 'risk', auth.uid()
    );
  end if;

  return v_admission;
end;
$$;

grant execute on function app.admit_client(
  uuid, uuid, timestamptz, integer, text, uuid, text, text, text, text, text,
  boolean, text, text, text, text, boolean, text, text, date, text[], text
) to authenticated;

comment on function app.admit_client is
  'Trusted admission workflow: resolve/create client (Kipu No., p_kipu_no, becomes a new client''s
   reference and is required in that case), allocate bed, assign staff, generate tasks — one
   transaction, or none of it happens.';

-- PostgREST-visible wrapper
create or replace function public.admit_client(
  p_centre_id             uuid,
  p_bed_id                uuid,
  p_admitted_at           timestamptz,
  p_planned_duration      integer,
  p_planned_duration_unit text,
  p_client_id             uuid      default null,
  p_first_name            text      default null,
  p_last_name             text      default null,
  p_preferred_name        text      default null,
  p_treatment_group       text      default null,
  p_substance_name        text      default null,
  p_peep_required         boolean   default false,
  p_focal_therapist_label text      default null,
  p_buddy_label           text      default null,
  p_doctor_label          text      default null,
  p_reason                text      default null,
  p_high_risk             boolean   default false,
  p_safeguarding_notes    text      default null,
  p_peeps_label           text      default null,
  p_detox_ends            date      default null,
  p_programme_modules     text[]    default array['contact','survey','familyvisit','lifestep','careplan'],
  p_kipu_no               text      default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.admit_client(
    p_centre_id, p_bed_id, p_admitted_at, p_planned_duration, p_planned_duration_unit,
    p_client_id, p_first_name, p_last_name, p_preferred_name, p_treatment_group,
    p_substance_name, p_peep_required, p_focal_therapist_label, p_buddy_label,
    p_doctor_label, p_reason, p_high_risk, p_safeguarding_notes,
    p_peeps_label, p_detox_ends, p_programme_modules, p_kipu_no
  );
$$;

grant execute on function public.admit_client(
  uuid, uuid, timestamptz, integer, text, uuid, text, text, text, text, text,
  boolean, text, text, text, text, boolean, text, text, date, text[], text
) to authenticated;

comment on function public.admit_client is
  'Thin PostgREST-visible wrapper over app.admit_client. All checks and logic live in the app schema.';
