-- 0011 · Task templates, client tasks, assignment history
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). 15 assertions passing (see 0012).
--
-- The whiteboard stores one value per action, so it cannot express "due Monday, done Wednesday".
-- That single limitation is why lateness is unmeasurable in it, and why `due_at` and `completed_at`
-- are separate columns here that neither may stand in for.

create table task_templates (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,

  -- Null centre means the template applies to every centre in the organisation. Centres may run
  -- different schedules, which is why this is nullable rather than assumed.
  centre_id       uuid references centres(id) on delete cascade,

  code            text not null,
  name            text not null,
  description     text,
  category        text not null check (category in
                    ('family_contact','milestone','session','medical','admin','discharge','survey','detox')),

  responsible_role_code text references roles(code),

  is_required     boolean not null default true,
  is_active       boolean not null default true,

  due_basis       text not null check (due_basis in
                    ('admission','planned_discharge','actual_discharge','prior_task_completion','manual')),
  due_offset      integer not null default 0,
  due_offset_unit text not null default 'days' check (due_offset_unit in ('hours','days','weeks')),
  prior_task_code text,

  reschedule_on_discharge_change boolean not null default false,

  requires_completion_note boolean not null default false,
  requires_evidence        boolean not null default false,

  -- Governs the detail, not the existence: a level-3 task still has a level-1 title.
  visibility_level smallint not null default 1 check (visibility_level between 1 and 4),

  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organisation_id, centre_id, code),
  constraint prior_task_required check (due_basis <> 'prior_task_completion' or prior_task_code is not null)
);

create table client_tasks (
  id              uuid primary key default gen_random_uuid(),
  admission_id    uuid not null,
  centre_id       uuid not null,
  template_id     uuid references task_templates(id) on delete set null,

  -- Copied from the template at generation. A template edited next year must not silently rewrite
  -- what a task said when someone completed it.
  code            text,
  category        text not null,
  title           text not null,
  description     text,

  responsible_role_code text references roles(code),
  assigned_user_id      uuid references user_profiles(id) on delete set null,

  -- The two dates the whiteboard cannot hold at once.
  due_at          timestamptz,
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  completed_by    uuid references user_profiles(id) on delete set null,

  -- 'overdue' is deliberately absent: it is derived from due_at against now(). A stored flag needs a
  -- job to keep it true and is wrong between runs. Deviation from the brief's status list, recorded
  -- in DECISIONS.
  status          text not null default 'not_started' check (status in
                    ('not_started','scheduled','in_progress','completed','blocked',
                     'cancelled','not_applicable','awaiting_review')),

  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),

  completion_notes      text,
  cancellation_reason   text,
  not_applicable_reason text,
  escalation_status     text check (escalation_status in ('none','raised','acknowledged','resolved')),

  -- Import provenance: the workbook cell verbatim, beside our reading of it, so an interpretation
  -- can be revisited without returning to the spreadsheet.
  source_value          text,
  source_interpretation text check (source_interpretation in
                          ('completed','scheduled','done_no_date','unclear','nothing_recorded')),

  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id),

  -- The rules the spreadsheet cannot enforce.
  constraint completed_has_timestamp check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint cancelled_has_reason check (
    status <> 'cancelled' or (cancellation_reason is not null and length(trim(cancellation_reason)) > 0)
  ),
  constraint not_applicable_has_reason check (
    status <> 'not_applicable' or (not_applicable_reason is not null and length(trim(not_applicable_reason)) > 0)
  ),

  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

create unique index client_tasks_one_per_template
  on client_tasks (admission_id, code) where code is not null;

create index client_tasks_admission_idx on client_tasks (admission_id);
-- Behind "what is overdue" and "what is due today".
create index client_tasks_due_open_idx on client_tasks (centre_id, due_at)
  where status not in ('completed','cancelled','not_applicable');
create index client_tasks_assigned_idx on client_tasks (assigned_user_id, due_at)
  where status not in ('completed','cancelled','not_applicable');
-- The unassigned queue: a responsible role, but no named owner.
create index client_tasks_unassigned_idx on client_tasks (centre_id, responsible_role_code, due_at)
  where assigned_user_id is null and status not in ('completed','cancelled','not_applicable');
create index client_tasks_status_idx on client_tasks (centre_id, status);

-- Reassignment closes one row and opens another, so "who was responsible on the day" stays
-- answerable after the fact.
create table task_assignments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references client_tasks(id) on delete cascade,
  assigned_to   uuid references user_profiles(id) on delete set null,
  assigned_role text references roles(code),
  assigned_by   uuid references auth.users(id),
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,
  reason        text,
  constraint assignment_window check (unassigned_at is null or unassigned_at > assigned_at),
  constraint assignee_present check (assigned_to is not null or assigned_role is not null)
);

create unique index task_assignments_one_open on task_assignments (task_id) where unassigned_at is null;
create index task_assignments_task_idx on task_assignments (task_id, assigned_at desc);

create trigger touch_task_templates before update on task_templates
  for each row execute function app.touch_updated_at();
create trigger touch_client_tasks before update on client_tasks
  for each row execute function app.touch_updated_at();

create trigger audit_client_tasks after insert or update or delete on client_tasks
  for each row execute function app.audit_row();
create trigger audit_task_assignments after insert or update or delete on task_assignments
  for each row execute function app.audit_row();
create trigger audit_task_templates after insert or update or delete on task_templates
  for each row execute function app.audit_row();

alter table task_templates   enable row level security;
alter table client_tasks     enable row level security;
alter table task_assignments enable row level security;
alter table task_templates   force row level security;
alter table client_tasks     force row level security;
alter table task_assignments force row level security;

create policy task_templates_read on task_templates for select to authenticated
  using (centre_id is null or app.can_access_centre(centre_id));
create policy task_templates_write on task_templates for all to authenticated
  using (app.has_permission('centre.manage'))
  with check (app.has_permission('centre.manage'));

create policy client_tasks_read on client_tasks for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('task.view'));
create policy client_tasks_write on client_tasks for all to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('task.complete'))
  with check (app.can_access_centre(centre_id) and app.has_permission('task.complete'));

create policy task_assignments_read on task_assignments for select to authenticated
  using (exists (select 1 from client_tasks t where t.id = task_assignments.task_id
                 and app.can_access_centre(t.centre_id)));
create policy task_assignments_write on task_assignments for all to authenticated
  using (app.has_permission('task.assign'))
  with check (app.has_permission('task.assign'));

comment on column client_tasks.status is
  'No "overdue" value: overdue is derived from due_at vs now(), because a stored flag goes stale.';
comment on column client_tasks.source_value is
  'The workbook cell verbatim, kept beside source_interpretation so a reading can be revisited.';
