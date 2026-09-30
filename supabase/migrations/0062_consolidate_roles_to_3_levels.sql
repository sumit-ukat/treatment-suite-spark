-- 0062 · Consolidate the 7-role model down to 3 authorisation levels.
--
-- Two independent things share the `roles` table: (1) user_access_assignments.role_id, which is
-- what actually grants permissions to a signed-in person, and (2) responsible_role_code columns on
-- task_templates/client_tasks/task_assignments, which just label which job function a task
-- nominally belongs to. Only (1) is being restructured here; (2) is data, not touched except to
-- reassign support_staff's rows onto therapist before support_staff is removed, since it would
-- otherwise leave those rows pointing at a deleted role.
--
-- platform_admin and centre_manager keep their existing `code` (both are referenced by real task
-- rows, or simply not worth renaming) and just get new names/descriptions plus a few added
-- permissions. therapist becomes Level 3 outright -- its existing permission set already matches
-- the proposed Level 3 list exactly, so only its name/description change.
--
-- regional_operations, supervisor, helpdesk and support_staff have zero live user_access_assignments
-- (verified against the live database before writing this), and support_staff's task references are
-- moved onto therapist in step 1, so all four are safe to remove outright rather than kept as dead
-- rows nobody can select from the Grant access role list.

-- 1. Move support_staff's task-responsibility rows onto therapist before support_staff is removed.
update public.client_tasks set responsible_role_code = 'therapist' where responsible_role_code = 'support_staff';
update public.task_templates set responsible_role_code = 'therapist' where responsible_role_code = 'support_staff';

-- 2. Remove the four roles this consolidation retires.
delete from public.role_permissions where role_id in (
  select id from public.roles where code in ('regional_operations', 'supervisor', 'helpdesk', 'support_staff')
);
delete from public.roles where code in ('regional_operations', 'supervisor', 'helpdesk', 'support_staff');

-- 3. Level 1 — Full access: rename platform_admin, add the one permission it was missing.
update public.roles
   set name = 'Level 1 — Full access',
       description = 'Every permission in the system, organisation-wide -- including managing other staff''s access and configuring centres.'
 where code = 'platform_admin';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r, public.permissions p
 where r.code = 'platform_admin' and p.code = 'incidents.log'
on conflict do nothing;

-- 4. Level 2 — Centre admin: rename centre_manager, add everything platform_admin has except
--    administration.manage_users and centres.manage (those two stay Level 1 only).
update public.roles
   set name = 'Level 2 — Centre admin',
       description = 'Full administrative and clinical control, scoped to whichever centre(s) this is granted at. Cannot manage other staff''s access or create/configure centres -- that stays Level 1 only.'
 where code = 'centre_manager';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p
    on p.code in ('discharge.approve', 'extension.approve', 'medical.record', 'reports.export', 'treatment.record', 'incidents.log')
 where r.code = 'centre_manager'
on conflict do nothing;

-- 5. Level 3 — Operational access: rename therapist. Its permission set already matches exactly
--    (view + complete assigned work, routine treatment/family recording, indicator-only risk and
--    safeguarding visibility) -- no role_permissions change needed.
update public.roles
   set name = 'Level 3 — Operational access',
       description = 'Day-to-day clinical/support access: view and complete assigned work, record routine treatment and family contact notes. No admissions, discharge, room management, identity editing, or narrative-level risk/safeguarding detail.'
 where code = 'therapist';
