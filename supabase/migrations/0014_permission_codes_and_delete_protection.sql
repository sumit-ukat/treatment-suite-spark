-- 0014 · Finer permission codes, and history that cannot be deleted
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). 18 assertions passing.
--
-- Two changes that touch the same policies, so they land together.
--
-- 1. HISTORY CANNOT BE DELETED. `FOR ALL` policies include DELETE, so anyone holding task.complete
--    could delete a completed task and anyone holding room.allocate could delete an allocation. The
--    audit trigger made that detectable, not impossible — and the brief prohibits both outright.
--
-- 2. FINER PERMISSION CODES. The previous set could not express "see the flag, not the narrative":
--    a single `safeguarding.view` is all-or-nothing. Splitting indicator from detail is what makes
--    the helpdesk rule representable at all, and the same applies to risk, medical, and to a client's
--    reference versus their name.

-- ---------------------------------------------------------------------------
-- New catalogue. Sensitivity 1 for indicators, 3 for the detail behind them — the split is the
-- point: an indicator is operational, the narrative is not.
-- ---------------------------------------------------------------------------
insert into permissions (code, description, sensitivity_level) values
  ('centres.view',                'View centre configuration',                          1),
  ('centres.manage',              'Configure centre settings',                          4),
  ('rooms.view',                  'View rooms and bed spaces',                          1),
  ('rooms.manage',                'Create and edit rooms and bed spaces',               1),
  ('rooms.allocate',              'Allocate a bed to an admission',                     1),
  ('rooms.transfer',              'Move a client between beds',                         1),
  ('clients.view_operational',    'See a client reference, room and dates',             1),
  ('clients.view_identity',       'See a client''s name and identifying details',       1),
  ('clients.edit_identity',       'Edit client identity',                               1),
  ('photos.view',                 'View client photographs',                            1),
  ('photos.upload',               'Upload or replace client photographs',               1),
  ('photos.verify',               'Verify that a photograph is the right client',       1),
  ('admissions.create',           'Admit a client',                                     1),
  ('admissions.edit',             'Edit an admission',                                  1),
  ('tasks.view',                  'View tasks and due dates',                           1),
  ('tasks.create',                'Create ad-hoc tasks',                                1),
  ('tasks.assign',                'Assign and reassign tasks',                          1),
  ('tasks.complete',              'Complete tasks',                                     1),
  ('tasks.reopen',                'Reopen a completed task',                            1),
  ('treatment.view',              'View treatment milestones and progress',             2),
  ('treatment.record',            'Record treatment milestones and sessions',           2),
  ('family.view',                 'View family contact and meeting status',             2),
  ('family.log_contact',          'Record a family contact',                            2),
  ('family.schedule_meeting',     'Schedule a family meeting or visit',                 2),
  ('medical.view_summary',        'See that a medical review exists and its status',    2),
  ('medical.view_detail',         'Read medical and detox detail',                      3),
  ('medical.record',              'Record medical reviews and outcomes',                3),
  ('risk.view_indicator',         'See that a risk exists - count or flag only',        1),
  ('risk.view_detail',            'Read risk narratives',                               3),
  ('risk.record',                 'Record risk concerns',                               3),
  ('safeguarding.view_indicator', 'See that a safeguarding concern exists - flag only', 1),
  ('safeguarding.view_detail',    'Read safeguarding narratives',                       3),
  ('safeguarding.record',         'Record safeguarding concerns',                       3),
  ('discharge.initiate',          'Start an early discharge',                           1),
  ('discharge.approve',           'Approve an early discharge',                         1),
  ('discharge.finalise',          'Finalise a discharge',                               1),
  ('reports.view',                'View centre and group reports',                      1),
  ('reports.export',              'Export data',                                        4),
  ('audit.view',                  'View audit history',                                 4),
  ('administration.manage_users', 'Manage users, roles and access assignments',         4)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Repoint every policy, splitting writes so DELETE is excluded by construction.
-- ---------------------------------------------------------------------------
drop policy if exists centres_write           on centres;
drop policy if exists rooms_write             on rooms;
drop policy if exists beds_write              on beds;
drop policy if exists clients_write           on clients;
drop policy if exists admissions_write        on admissions;
drop policy if exists allocations_write       on room_allocations;
drop policy if exists staff_assignments_write on staff_assignments;
drop policy if exists client_tasks_read       on client_tasks;
drop policy if exists client_tasks_write      on client_tasks;
drop policy if exists task_assignments_write  on task_assignments;
drop policy if exists task_templates_write    on task_templates;
drop policy if exists profiles_read_self      on user_profiles;
drop policy if exists profiles_write          on user_profiles;
drop policy if exists assignments_read        on user_access_assignments;
drop policy if exists assignments_write       on user_access_assignments;
drop policy if exists audit_read              on audit_events;

create policy centres_write on centres for update to authenticated
  using (app.can_access_centre(id) and app.has_permission('centres.manage'))
  with check (app.can_access_centre(id) and app.has_permission('centres.manage'));

create policy rooms_write on rooms for all to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('rooms.manage'))
  with check (app.can_access_centre(centre_id) and app.has_permission('rooms.manage'));

create policy beds_write on beds for all to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('rooms.manage'))
  with check (app.can_access_centre(centre_id) and app.has_permission('rooms.manage'));

-- Archive via clients.status. Never delete.
create policy clients_insert on clients for insert to authenticated
  with check (app.has_permission('clients.edit_identity'));
create policy clients_update on clients for update to authenticated
  using (app.has_permission('clients.edit_identity')
         and exists (select 1 from admissions a where a.client_id = clients.id
                     and app.can_access_centre(a.centre_id)))
  with check (app.has_permission('clients.edit_identity'));

create policy admissions_insert on admissions for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('admissions.create'));
create policy admissions_update on admissions for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('admissions.edit'))
  with check (app.can_access_centre(centre_id) and app.has_permission('admissions.edit'));

-- Allocations are history: a transfer ends one row and opens another.
create policy allocations_insert on room_allocations for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('rooms.allocate'));
create policy allocations_update on room_allocations for update to authenticated
  using (app.can_access_centre(centre_id)
         and (app.has_permission('rooms.allocate') or app.has_permission('rooms.transfer')))
  with check (app.can_access_centre(centre_id));

create policy staff_assignments_insert on staff_assignments for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('admissions.edit'));
create policy staff_assignments_update on staff_assignments for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('admissions.edit'))
  with check (app.can_access_centre(centre_id) and app.has_permission('admissions.edit'));

create policy client_tasks_read on client_tasks for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('tasks.view'));
create policy client_tasks_insert on client_tasks for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('tasks.create'));
create policy client_tasks_update on client_tasks for update to authenticated
  using (app.can_access_centre(centre_id)
         and (app.has_permission('tasks.complete') or app.has_permission('tasks.assign')))
  with check (app.can_access_centre(centre_id));

create policy task_assignments_insert on task_assignments for insert to authenticated
  with check (app.has_permission('tasks.assign'));
create policy task_assignments_update on task_assignments for update to authenticated
  using (app.has_permission('tasks.assign'))
  with check (app.has_permission('tasks.assign'));

create policy task_templates_write on task_templates for all to authenticated
  using (app.has_permission('centres.manage'))
  with check (app.has_permission('centres.manage'));

create policy profiles_read_self on user_profiles for select to authenticated
  using (id = auth.uid() or app.can_read('administration.manage_users'));
create policy profiles_write on user_profiles for all to authenticated
  using (app.has_permission('administration.manage_users'))
  with check (app.has_permission('administration.manage_users'));

create policy assignments_read on user_access_assignments for select to authenticated
  using (user_id = auth.uid() or app.can_read('administration.manage_users'));
create policy assignments_write on user_access_assignments for all to authenticated
  using (app.has_permission('administration.manage_users'))
  with check (app.has_permission('administration.manage_users'));

create policy audit_read on audit_events for select to authenticated
  using (app.can_read('audit.view') and (centre_id is null or app.can_access_centre(centre_id)));

-- ---------------------------------------------------------------------------
-- Belt as well as braces. A policy added by mistake later cannot re-open DELETE.
-- Verified: even an organisation-wide platform administrator is refused.
-- ---------------------------------------------------------------------------
revoke delete on clients, admissions, room_allocations, client_tasks,
                 task_assignments, staff_assignments
  from authenticated, anon;

comment on table room_allocations is
  'Append-and-close history. DELETE revoked: a transfer ends one row and opens another.';
comment on table client_tasks is
  'DELETE revoked. Close a task with cancelled or not_applicable and a reason; never remove it.';
