-- Seed data — FICTIONAL ONLY.
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03).
-- Verified bed order: 1, 2, 3, 4, 5, 6A, 6B, 7, 8, 9A, 9B, 10, 11, 12, 13, 14, 15, 16
--
-- Room and bed labels are taken from the source whiteboard. Labels are not personal data.
-- No client names, no photographs, no safeguarding text, and no other workbook content appears
-- here or anywhere else in this repository. See docs/SECURITY_MODEL.md §7.

begin;

insert into organisations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Example Care Group', 'example-care-group')
on conflict (slug) do nothing;

insert into zones (id, organisation_id, name, code)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'South East', 'SE'
)
on conflict (organisation_id, code) do nothing;

insert into centres (id, organisation_id, zone_id, name, slug, timezone)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'Primrose Lodge', 'primrose-lodge', 'Europe/London'
)
on conflict (organisation_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Primrose Lodge: 16 rooms / 18 bed spaces
--
-- Rooms 1-5, 7, 8, 10-16 are single occupancy (one bed, label = room label).
-- Rooms 6 and 9 are shared and expose two beds each: 6A/6B and 9A/9B.
--
-- 14 single + 4 shared beds = 18 bed spaces, matching the source whiteboard exactly.
--
-- !! KNOWN INCOMPLETE — the real centre has 19 bed spaces (confirmed 2026-08-03).
--
--    The whiteboard has been missing one all along. Which one is OPEN_QUESTIONS Q40: either a 17th
--    room, or a third shared room splitting into A/B.
--
--    The 18 below are what the source data actually evidences. A guessed 19th label would be worse
--    than being one short: it would look authoritative, get allocated against, and quietly disagree
--    with the physical building. The assertion at the end of this file therefore still expects 18,
--    and will fail loudly the moment someone adds a bed without updating it.
-- ---------------------------------------------------------------------------

with centre as (
  select id from centres where slug = 'primrose-lodge'
),
spec(label, room_type, sort_order) as (
  values
    ('1',  'single', 10), ('2',  'single', 20), ('3',  'single', 30),
    ('4',  'single', 40), ('5',  'single', 50),
    ('6',  'shared', 60),
    ('7',  'single', 70), ('8',  'single', 80),
    ('9',  'shared', 90),
    ('10', 'single', 100), ('11', 'single', 110), ('12', 'single', 120),
    ('13', 'single', 130), ('14', 'single', 140), ('15', 'single', 150),
    ('16', 'single', 160)
)
insert into rooms (centre_id, label, room_type, sort_order)
select centre.id, spec.label, spec.room_type, spec.sort_order
from centre cross join spec
on conflict (centre_id, label) do nothing;

-- Single rooms: one bed carrying the room's own label.
insert into beds (room_id, centre_id, label, sort_order)
select r.id, r.centre_id, r.label, r.sort_order
from rooms r
join centres c on c.id = r.centre_id and c.slug = 'primrose-lodge'
where r.room_type = 'single'
on conflict (centre_id, label) do nothing;

-- Shared rooms: two beds each, suffixed A and B.
insert into beds (room_id, centre_id, label, sort_order)
select r.id, r.centre_id, r.label || suffix.s, r.sort_order + suffix.offset_
from rooms r
join centres c on c.id = r.centre_id and c.slug = 'primrose-lodge'
cross join (values ('A', 1), ('B', 2)) as suffix(s, offset_)
where r.room_type = 'shared'
on conflict (centre_id, label) do nothing;

commit;

-- Sanity check — expect 16 rooms and 18 beds.
do $$
declare
  room_count integer;
  bed_count  integer;
begin
  select count(*) into room_count
    from rooms r join centres c on c.id = r.centre_id where c.slug = 'primrose-lodge';
  select count(*) into bed_count
    from beds b join centres c on c.id = b.centre_id where c.slug = 'primrose-lodge';

  if room_count <> 16 or bed_count <> 18 then
    raise exception 'Primrose Lodge seed is wrong: expected 16 rooms / 18 beds, got % / %',
      room_count, bed_count;
  end if;

  raise notice 'Primrose Lodge seeded: % rooms, % beds', room_count, bed_count;
end;
$$;
