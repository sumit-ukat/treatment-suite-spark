-- 0084 · Remove incident reporting entirely (migrations 0050/0051/0052)
--
-- The feature's own nav entry had already been hidden from the sidebar with no plan recorded to
-- restore it, the table held zero rows, and the 'incidents.log' permission was granted to no role —
-- confirmed directly before writing this. A full rip-out rather than leaving a dead screen behind a
-- URL nobody is told, or permanently-zero count tiles with a dashboard link that goes nowhere.

drop function if exists app.log_incident_report(uuid, text, text, uuid, text, text, text, timestamptz);
drop function if exists public.log_incident_report(uuid, text, text, uuid, text, text, text, timestamptz);
drop function if exists app.incident_report_count_7d(uuid);
drop function if exists public.incident_report_count_7d(uuid);
drop function if exists app.incident_report_count_all_7d();
drop function if exists public.incident_report_count_all_7d();

drop table if exists public.incident_reports;

delete from role_permissions where permission_id in (
  select id from permissions where code = 'incidents.log'
);
delete from permissions where code = 'incidents.log';
