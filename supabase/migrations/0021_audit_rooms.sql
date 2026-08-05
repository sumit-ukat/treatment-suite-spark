-- 0021 · rooms was missing its audit trigger
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05). Verified: room INSERT and UPDATE now both
-- appear in audit_events.
--
-- beds and centres both got an audit trigger from migration 0009; rooms was omitted from that list
-- by mistake. Found while verifying the new Rooms & Beds administration screen — a room created
-- through it was not appearing in audit_events at all.
--
-- This matters more now than it would have a week ago: staff will be entering real room
-- configuration themselves, and "who added this room and when" is exactly the kind of change that
-- needs to be reconstructable later.
create trigger audit_rooms after insert or update or delete on rooms
  for each row execute function app.audit_row();
