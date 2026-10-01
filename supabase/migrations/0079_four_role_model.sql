-- 0079 · Rename the 3 live roles to plain job titles, retire 4 unused legacy roles, add a 4th
-- "Centre Staff" role for non-clinical centre personnel.
--
-- Migration 0062 (consolidate_roles_to_3_levels) was written but never actually applied to this
-- database — the live `roles` table still carries the original 7 roles under their original names
-- (confirmed by direct query before writing this: platform_admin/centre_manager/therapist plus
-- regional_operations/supervisor/helpdesk/support_staff, none of the "Level 1/2/3" naming 0062
-- intended). Re-verified zero live user_access_assignments for the four legacy roles below before
-- deleting them — the same check 0062's own header comment describes, re-run because time has
-- passed since that comment was written and it was never actually acted on.
--
-- platform_admin / centre_manager / therapist keep their existing `code` (a stable identifier other
-- code, comments, and this migration's own permission counts rely on) and existing permission sets —
-- only the display name/description change, to a plain job title rather than the "Level N" framing
-- 0062 proposed and the live app never actually showed.
--
-- centre_staff is new: view-only, with client names and basic facts, but no clinical/risk/
-- safeguarding detail, no task completion, no admin/discharge/extension capability — for
-- maintenance, reception, or other centre personnel who need to know who/where, not clinical detail.

-- 1. Retire the 4 roles with zero live user_access_assignments (verified via a direct count query
--    immediately before writing this migration). support_staff is still referenced by
--    responsible_role_code on 5 task_templates rows and 55 client_tasks rows (checked directly —
--    regional_operations/supervisor/helpdesk have none anywhere) — reassign those onto therapist
--    first, same as migration 0062 originally intended, so the FK to roles.code doesn't block the
--    delete below.
update task_templates set responsible_role_code = 'therapist' where responsible_role_code = 'support_staff';
update client_tasks set responsible_role_code = 'therapist' where responsible_role_code = 'support_staff';

delete from role_permissions where role_id in (
  select id from roles where code in ('regional_operations', 'supervisor', 'helpdesk', 'support_staff')
);
delete from roles where code in ('regional_operations', 'supervisor', 'helpdesk', 'support_staff');

-- 2. Rename the 3 live roles.
update roles set
  name = 'Super Admin',
  description = 'Full system access — every centre, every permission, including managing other staff''s access and configuring centres.'
 where code = 'platform_admin';

update roles set
  name = 'Centre Manager',
  description = 'Full administrative and clinical control, scoped to whichever centre(s) this is granted at. Cannot manage other staff''s access or create/configure centres.'
 where code = 'centre_manager';

update roles set
  name = 'Therapist',
  description = 'Day-to-day clinical work: view and complete assigned tasks, record treatment sessions and family contact. No admissions, discharge, room management, or client-identity editing.'
 where code = 'therapist';

-- 3. New role: Centre Staff.
insert into roles (code, name, description)
values (
  'centre_staff',
  'Centre Staff',
  'View-only: sees which beds/rooms are occupied, client names and basic facts, and the task list. No clinical, risk, or safeguarding detail, no task completion, no admin or clinical recording.'
)
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r, permissions p
 where r.code = 'centre_staff'
   and p.code in (
     'centres.view', 'clients.view_operational', 'clients.view_identity',
     'rooms.view', 'tasks.view', 'risk.view_indicator', 'safeguarding.view_indicator'
   )
on conflict do nothing;
