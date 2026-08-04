-- 0012 · Due-date computation, task generation, discharge recalculation
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). 15 assertions passing, including DST parity
-- with the TypeScript domain layer.
--
-- This mirrors src/domain/tasks.ts. The duplication is deliberate: the browser needs the logic to
-- preview and sort, the database needs it because business rules must live somewhere a client cannot
-- bypass. They must agree, and DST is where they would most easily diverge, so both follow one rule:
--
--   days / weeks -> CALENDAR arithmetic on the centre's wall clock, preserving time of day
--   hours        -> ELAPSED arithmetic on the instant, unaffected by the clocks changing
--
-- `x AT TIME ZONE tz` on a timestamptz yields local wall clock; adding an interval to that is
-- calendar arithmetic; converting back re-anchors it. A 28-day stay beginning 14:00 BST therefore
-- ends 14:00 GMT, not 13:00. Both implementations are tested against 2026-10-20 -> 2026-11-17 14:00.

create or replace function app.compute_due_at(
  p_basis            text,
  p_offset           integer,
  p_unit             text,
  p_admitted_at      timestamptz,
  p_planned_discharge date,
  p_actual_discharge timestamptz,
  p_prior_completed  timestamptz,
  p_timezone         text,
  p_deadline_hour    integer default 17,
  p_deadline_minute  integer default 0
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_anchor timestamptz;
begin
  v_anchor := case p_basis
    when 'admission'             then p_admitted_at
    when 'actual_discharge'      then p_actual_discharge
    when 'prior_task_completion' then p_prior_completed
    when 'planned_discharge'     then
      case when p_planned_discharge is null then null
           else ((p_planned_discharge
                  + make_interval(hours => p_deadline_hour, mins => p_deadline_minute))
                 at time zone p_timezone)
      end
    else null                                   -- 'manual', or an anchor that does not exist yet
  end;

  -- Null is a legitimate, visible state. Never back-fill a guessed deadline.
  if v_anchor is null then
    return null;
  end if;

  if p_unit = 'hours' then
    return v_anchor + make_interval(hours => p_offset);
  end if;

  return ((v_anchor at time zone p_timezone)
          + make_interval(days => case when p_unit = 'weeks' then p_offset * 7 else p_offset end))
         at time zone p_timezone;
end;
$$;

-- Idempotent: re-running adds only missing templates, so it is safe after a template is introduced
-- part-way through a stay.
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

    insert into public.client_tasks (
      admission_id, centre_id, template_id, code, category, title, description,
      responsible_role_code, due_at, status
    ) values (
      p_admission_id, v_adm.centre_id, tpl.id, tpl.code, tpl.category, tpl.name, tpl.description,
      tpl.responsible_role_code, v_due, 'not_started'
    );
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

-- Recalculate open, discharge-based deadlines when the planned discharge date moves.
--
-- Completed, cancelled and not-applicable tasks are never touched. A completed task's due date is
-- the evidence of whether that work was on time; rewriting it would falsify the record of a past
-- deadline. This is the failure the workbook demonstrates: its pre-discharge dates were computed by
-- hand, and stayed put when one client's discharge moved by 29 days.
create or replace function app.recalculate_discharge_tasks(p_admission_id uuid)
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
  v_updated integer := 0;
  t         record;
  v_due     timestamptz;
begin
  select * into v_adm from public.admissions where id = p_admission_id;
  if not found then return 0; end if;

  select c.timezone,
         coalesce((c.settings #>> '{defaultDeadlineTimeOfDay,hour}')::int, 17),
         coalesce((c.settings #>> '{defaultDeadlineTimeOfDay,minute}')::int, 0)
    into v_tz, v_hour, v_minute
    from public.centres c where c.id = v_adm.centre_id;

  for t in
    select ct.id, tt.due_offset, tt.due_offset_unit
    from public.client_tasks ct
    join public.task_templates tt on tt.id = ct.template_id
    where ct.admission_id = p_admission_id
      and ct.status not in ('completed','cancelled','not_applicable')
      and ct.completed_at is null
      and tt.due_basis = 'planned_discharge'
      and tt.reschedule_on_discharge_change
  loop
    v_due := app.compute_due_at('planned_discharge', t.due_offset, t.due_offset_unit,
              v_adm.admitted_at, v_adm.current_planned_discharge_date, v_adm.actual_discharge_at,
              null, v_tz, v_hour, v_minute);

    update public.client_tasks set due_at = v_due where id = t.id and due_at is distinct from v_due;
    if found then v_updated := v_updated + 1; end if;
  end loop;

  return v_updated;
end;
$$;

-- Automatic, rather than relying on every caller to remember.
create or replace function app.on_discharge_date_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_planned_discharge_date is distinct from old.current_planned_discharge_date then
    perform app.recalculate_discharge_tasks(new.id);
  end if;
  return new;
end;
$$;

create trigger admissions_recalculate_tasks
  after update on admissions
  for each row execute function app.on_discharge_date_change();

grant execute on function app.compute_due_at(text,integer,text,timestamptz,date,timestamptz,timestamptz,text,integer,integer) to authenticated;
grant execute on function app.generate_admission_tasks(uuid) to authenticated;
grant execute on function app.recalculate_discharge_tasks(uuid) to authenticated;
