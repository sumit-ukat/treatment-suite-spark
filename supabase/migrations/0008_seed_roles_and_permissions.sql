-- 0008 · Role and permission catalogue
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03).
--
-- Reference data, so it lives in a migration rather than seed.sql: policies reference these codes,
-- and a database without them denies everything.
--
-- Permission sets for three roles are PROVISIONAL. The brief explicitly says to clarify rather than
-- assume what a regional operations manager, supervisor and support staff may do, so only the
-- uncontested read/oversight permissions are granted. Notably absent from all three: medical.view and
-- safeguarding.view — "regional visibility must not imply unrestricted access to clinical detail".
-- See OPEN_QUESTIONS Q24-Q29.

insert into permissions (code, description, sensitivity_level) values
  ('centre.manage',       'Configure centre settings',                   4),
  ('room.manage',         'Create and edit rooms and bed spaces',        1),
  ('room.allocate',       'Allocate and transfer beds',                  1),
  ('client.manage',       'Create and edit client records',              1),
  ('admission.manage',    'Create and edit admissions',                  1),
  ('photo.upload',        'Upload client photographs',                   1),
  ('photo.verify',        'Verify client photographs',                   1),
  ('task.view',           'View tasks and due dates',                    1),
  ('task.complete',       'Complete operational tasks',                  1),
  ('task.assign',         'Assign and reassign tasks',                   1),
  ('treatment.view',      'View treatment milestones and progress',      2),
  ('treatment.record',    'Record treatment milestones and sessions',    2),
  ('family.manage',       'Manage family contacts, meetings and visits', 2),
  ('medical.view',        'View detox and medical review detail',        3),
  ('medical.record',      'Record medical reviews and outcomes',         3),
  ('safeguarding.view',   'View safeguarding and risk narratives',       3),
  ('safeguarding.record', 'Record safeguarding and risk concerns',       3),
  ('discharge.initiate',  'Initiate an early discharge',                 1),
  ('discharge.approve',   'Approve an early discharge',                  1),
  ('report.view',         'View centre and group reports',               1),
  ('audit.view',          'View audit history',                          4),
  ('access.manage',       'Manage users, roles and access assignments',  4),
  ('export.data',         'Export data',                                 4)
on conflict (code) do nothing;

insert into roles (code, name, description, is_system) values
  ('platform_admin',      'Platform administrator',      'Full access including user and access management.', true),
  ('regional_operations', 'Regional operations manager', 'Oversight across assigned region or centres.',      true),
  ('supervisor',          'Supervisor',                  'Oversight across assigned centres.',                true),
  ('centre_manager',      'Centre manager',              'Day-to-day management of assigned centres.',        true),
  ('therapist',           'Therapist',                   'Treatment delivery for assigned clients.',          true),
  ('support_staff',       'Support staff',               'Operational support tasks.',                        true),
  ('helpdesk',            'Helpdesk',                    'Operational coordination, no clinical access.',     true)
on conflict (code) do nothing;

-- platform_admin: everything, by construction rather than by an enumerated list, so a new permission
-- is never accidentally withheld from the administrator role.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.code = 'platform_admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'room.manage','room.allocate','client.manage','admission.manage','photo.upload','photo.verify',
  'task.view','task.complete','task.assign','treatment.view','family.manage','medical.view',
  'safeguarding.view','safeguarding.record','discharge.initiate','report.view','audit.view')
where r.code = 'centre_manager' on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'task.view','task.complete','treatment.view','treatment.record','family.manage','photo.upload')
where r.code = 'therapist' on conflict do nothing;

-- helpdesk: deliberately narrow. No treatment, medical or safeguarding permission of any kind, per
-- the brief's explicit restrictions.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('task.view','task.assign')
where r.code = 'helpdesk' on conflict do nothing;

-- PROVISIONAL (Q24-Q29).
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('task.view','report.view','audit.view')
where r.code = 'regional_operations' on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'task.view','task.assign','treatment.view','report.view','audit.view')
where r.code = 'supervisor' on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'task.view','task.complete','photo.upload')
where r.code = 'support_staff' on conflict do nothing;
