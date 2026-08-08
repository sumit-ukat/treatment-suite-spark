-- 0018 · Answers: buddy, applicability, photos
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05). Reconstructed 2026-08-08 from
-- supabase_migrations.schema_migrations (version 20260805093811) — this file was applied live but
-- never committed to the repo, so the migration history had a real gap between 0017 and 0019. The
-- statements below are the exact ones already run; nothing here is being re-applied, only recorded.

-- Three confirmed answers, applied.
--
-- Q41  A buddy is STAFF provided by the centre, not a peer client.
-- Q2   X means the programme does not reach that week — not applicable, not unknown.
-- Q43  Photograph verification is not required; photos are taken at admission and that is that.

-- ---------------------------------------------------------------------------
-- Q41 · Buddies are staff
--
-- The earlier evidence — one buddy value matching a client name — was a coincidence of first names,
-- not a peer relationship. Removing 'peer' rather than leaving it as a dead option: an unused enum
-- value is an invitation to use it wrongly later.
-- ---------------------------------------------------------------------------
alter table staff_assignments drop constraint assignee_matches_kind;
alter table staff_assignments drop constraint peer_is_not_self;

update staff_assignments set assignee_kind = 'unresolved', peer_admission_id = null
 where assignee_kind = 'peer';

alter table staff_assignments drop column peer_admission_id;

alter table staff_assignments
  drop constraint staff_assignments_assignee_kind_check;
alter table staff_assignments
  add constraint staff_assignments_assignee_kind_check
  check (assignee_kind in ('staff','unresolved'));

alter table staff_assignments
  add constraint assignee_matches_kind check (
    (assignee_kind = 'staff' and staff_user_id is not null)
    or (assignee_kind = 'unresolved' and staff_user_id is null and display_label is not null)
  );

comment on column staff_assignments.assignee_kind is
  'staff | unresolved. Confirmed 2026-08-04: a buddy is a member of centre staff, not a peer client.';

-- ---------------------------------------------------------------------------
-- Q43 · Photograph verification becomes a per-centre setting
--
-- Not deleted, because the master brief requires the capability and another centre may want it.
-- Turned off for everyone by default, which is the confirmed position for Primrose Lodge.
-- ---------------------------------------------------------------------------
update centres
   set settings = settings || jsonb_build_object('photoVerificationRequired', false);

-- With verification off, a photograph is accepted as soon as it is uploaded. 'unverified' would
-- otherwise show as an outstanding action forever and train people to ignore the indicator.
alter table client_photos
  add column verification_required boolean not null default false;

comment on column client_photos.verification_required is
  'From centres.settings at upload. False means the photo is accepted on upload (Q43).';

-- ---------------------------------------------------------------------------
-- Q2 · X means the programme does not reach that week
--
-- So the task is NOT APPLICABLE, which is a different thing from unknown, and different again from
-- outstanding. Generation now decides this up front: a task whose deadline falls after the planned
-- discharge is created as not_applicable with a reason, rather than as work nobody will ever do.
--
-- It is created rather than skipped on purpose. If the stay is later extended, the task must come
-- back — and it cannot come back if it was never written down.
-- ---------------------------------------------------------------------------
create or replace function app.generate_admission_tasks(p_admission_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm     public.admissions%rowtype;
  v_tz      text;
  v_hour    integer;
  v_minute  integer;
  v_created integer := 0;
  tpl       record;
  v_due     timestamptz;
  v_beyond  boolean;
begin
  select * into v_adm from public.admissions where id = p_admission_id;
  if not found then
    raise exception 'Admission % not found', p_admission_id;
  end if;

  select c.timezone,
         coalesce((c.settings #>> '{defaultDeadlineTimeOfDay,hour}')::int, 17),
         coalesce((c.settings #>> '{defaultDeadlineTimeOfDay,minute}')::int, 0)
    into v_tz, v_hour, v_minute
    from public.centres c where c.id = v_adm.centre_id;

  for tpl in
    select * from public.task_templates t
    where t.is_active
      and t.organisation_id = v_adm.organisation_id
      and (t.centre_id is null or t.centre_id = v_adm.centre_id)
    order by t.sort_order, t.code
  loop
    if exists (select 1 from public.client_tasks ct
               where ct.admission_id = p_admission_id and ct.code = tpl.code) then
      continue;
    end if;

    v_due := app.compute_due_at(
      tpl.due_basis, tpl.due_offset, tpl.due_offset_unit,
      v_adm.admitted_at, v_adm.current_planned_discharge_date, v_adm.actual_discharge_at,
      null, v_tz, v_hour, v_minute
    );

    -- Only admission-anchored deadlines can fall outside the stay. A discharge-anchored one moves
    -- with the discharge date by definition, so it is always in range.
    v_beyond := tpl.due_basis = 'admission'
                and v_due is not null
                and v_adm.current_planned_discharge_date is not null
                and (v_due at time zone v_tz)::date > v_adm.current_planned_discharge_date;

    insert into public.client_tasks (
      admission_id, centre_id, template_id, code, category, title, description,
      responsible_role_code, due_at, status, not_applicable_reason
    ) values (
      p_admission_id, v_adm.centre_id, tpl.id, tpl.code, tpl.category, tpl.name, tpl.description,
      tpl.responsible_role_code, v_due,
      case when v_beyond then 'not_applicable' else 'not_started' end,
      case when v_beyond then 'Planned programme ends before this falls due' else null end
    );
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

-- Extending or shortening a stay changes which tasks apply.
--
-- Extend a 10-day stay to 28 and the week-3 session becomes real work again; shorten it and the
-- reverse. Only tasks auto-marked by generation are flipped back — a human who marked something not
-- applicable for their own reason keeps their decision, and nothing completed is ever touched.
create or replace function app.reapply_task_applicability(p_admission_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm     public.admissions%rowtype;
  v_tz      text;
  v_changed integer := 0;
begin
  select * into v_adm from public.admissions where id = p_admission_id;
  if not found or v_adm.current_planned_discharge_date is null then return 0; end if;
  select c.timezone into v_tz from public.centres c where c.id = v_adm.centre_id;

  -- Now inside the stay: bring it back.
  update public.client_tasks ct
     set status = 'not_started', not_applicable_reason = null
   where ct.admission_id = p_admission_id
     and ct.status = 'not_applicable'
     and ct.not_applicable_reason = 'Planned programme ends before this falls due'
     and ct.due_at is not null
     and (ct.due_at at time zone v_tz)::date <= v_adm.current_planned_discharge_date;
  get diagnostics v_changed = row_count;

  -- Now beyond the stay: stand it down, but never something already done or already closed by hand.
  update public.client_tasks ct
     set status = 'not_applicable',
         not_applicable_reason = 'Planned programme ends before this falls due'
   where ct.admission_id = p_admission_id
     and ct.status = 'not_started'
     and ct.completed_at is null
     and ct.due_at is not null
     and (ct.due_at at time zone v_tz)::date > v_adm.current_planned_discharge_date;

  return v_changed;
end;
$$;

create or replace function app.on_discharge_date_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_planned_discharge_date is distinct from old.current_planned_discharge_date then
    perform app.recalculate_discharge_tasks(new.id);
    perform app.reapply_task_applicability(new.id);
  end if;
  return new;
end;
$$;

grant execute on function app.reapply_task_applicability(uuid) to authenticated;
