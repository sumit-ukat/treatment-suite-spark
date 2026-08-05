-- 0015 · Remap every role onto the new permission catalogue
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). Verified by role, not by assertion in a doc.
--
-- Rebuilt from empty rather than patched, so no grant survives by accident. The old codes are
-- retired at the end, once nothing references them.

delete from role_permissions;

-- platform_admin: everything, by construction. An enumerated list would silently withhold each new
-- permission from the one role that must be able to grant it.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.code = 'platform_admin';

-- centre_manager: runs the centre. Holds safeguarding and risk DETAIL, since they are the escalation
-- point named in the brief. Cannot manage users — technical administration is deliberately separate
-- from clinical access.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'centres.view','rooms.view','rooms.manage','rooms.allocate','rooms.transfer',
  'clients.view_operational','clients.view_identity','clients.edit_identity',
  'photos.view','photos.upload','photos.verify',
  'admissions.create','admissions.edit',
  'tasks.view','tasks.create','tasks.assign','tasks.complete','tasks.reopen',
  'treatment.view','family.view','family.log_contact','family.schedule_meeting',
  'medical.view_summary','medical.view_detail',
  'risk.view_indicator','risk.view_detail','risk.record',
  'safeguarding.view_indicator','safeguarding.view_detail','safeguarding.record',
  'discharge.initiate','discharge.finalise','reports.view','audit.view')
where r.code = 'centre_manager';

-- therapist: treatment work. Sees that a concern exists, not what it says; no rooms, no user admin.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'centres.view','rooms.view','clients.view_operational','clients.view_identity','photos.view',
  'tasks.view','tasks.complete','treatment.view','treatment.record',
  'family.view','family.log_contact','medical.view_summary',
  'risk.view_indicator','safeguarding.view_indicator')
where r.code = 'therapist';

-- support_staff: operational only.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'centres.view','rooms.view','clients.view_operational','clients.view_identity','photos.view',
  'tasks.view','tasks.complete','family.view','family.log_contact',
  'risk.view_indicator','safeguarding.view_indicator')
where r.code = 'support_staff';

-- helpdesk: the narrowest role, and the reason the indicator/detail split exists at all.
-- Note the absence of clients.view_identity: helpdesk sees "PL-1042", never the name. Seven
-- permissions, none of them clinical.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'centres.view','rooms.view','clients.view_operational',
  'tasks.view','tasks.assign',
  'risk.view_indicator','safeguarding.view_indicator')
where r.code = 'helpdesk';

-- supervisor: oversight across assigned centres. PROVISIONAL pending Q23 and Q29.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'centres.view','rooms.view','clients.view_operational','clients.view_identity',
  'tasks.view','tasks.assign','treatment.view','family.view',
  'medical.view_summary','risk.view_indicator','safeguarding.view_indicator',
  'reports.view','audit.view','discharge.approve')
where r.code = 'supervisor';

-- regional_operations: oversight WITHOUT clinical detail, which is the brief's explicit instruction —
-- regional visibility must not imply unrestricted access to clinical content. PROVISIONAL, Q24/Q28/Q29.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'centres.view','rooms.view','clients.view_operational',
  'tasks.view','medical.view_summary',
  'risk.view_indicator','safeguarding.view_indicator',
  'reports.view','reports.export','audit.view')
where r.code = 'regional_operations';

-- Retire the superseded codes now that no policy and no grant references them.
delete from permissions where code in (
  'centre.manage','room.manage','room.allocate','client.manage','admission.manage',
  'photo.upload','photo.verify','task.view','task.complete','task.assign',
  'family.manage','medical.view','safeguarding.view','report.view',
  'access.manage','export.data');

-- Resulting grant counts: platform_admin 40 · centre_manager 34 · therapist 14 · supervisor 14 ·
-- support_staff 11 · regional_operations 10 · helpdesk 7.
--
-- Verified: helpdesk, support_staff and regional_operations hold zero of
-- medical.view_detail / risk.view_detail / safeguarding.view_detail.
