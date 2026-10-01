-- 0083 · Five-role model: add Operations Manager, rename Therapist → Clinical Staff and
-- Centre Staff → View Only.
--
-- Operations Manager sits between Super Admin (everything, every centre) and Centre Manager (full
-- control, one centre): oversight and second-signature approval authority across the group, no
-- hands-on clinical recording, no admin/user-management, no room/bed management. Its permission set
-- is the union of two roles migration 0079 retired for having zero live assignments at the time —
-- supervisor (approval + oversight) and regional_operations (cross-centre reporting) — recombined
-- under a new code and name rather than resurrecting either verbatim, since neither alone matches
-- what's being asked for now.
--
-- Clinical Staff and View Only keep their existing `code` (therapist / centre_staff) and permission
-- sets — only the display name/description change, to match the broader job titles actually in use
-- ("Therapist, support workers and more" / plain "view only") rather than the narrower original names.

insert into roles (code, name, description)
values (
  'operations_manager',
  'Operations Manager',
  'Oversight and approval across every centre: sign off discharges and stay extensions, view reports, audit history, and operational detail group-wide. Cannot manage other staff''s access, configure centres, or do hands-on clinical recording.'
)
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r, permissions p
 where r.code = 'operations_manager'
   and p.code in (
     'audit.view', 'centres.view', 'clients.view_identity', 'clients.view_operational',
     'discharge.approve', 'extension.approve', 'family.view', 'medical.view_summary',
     'reports.export', 'reports.view', 'risk.view_indicator', 'rooms.view',
     'safeguarding.view_indicator', 'tasks.assign', 'tasks.view', 'treatment.view'
   )
on conflict do nothing;

update roles set
  name = 'Clinical Staff',
  description = 'Does the clinical work — therapists, support workers, and similar roles. View and complete assigned tasks, record treatment sessions and family contact. No admissions, discharge, room management, or client-identity editing.'
 where code = 'therapist';

update roles set
  name = 'View Only',
  description = 'View-only: sees which beds/rooms are occupied, client names and basic facts, and the task list. No clinical, risk, or safeguarding detail, no task completion, no admin or clinical recording.'
 where code = 'centre_staff';
