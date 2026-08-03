-- 0002 · Organisation hierarchy: organisations, zones, centres, rooms, beds
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03). Verified: 16 rooms / 18 beds.
--
-- Primrose Lodge is a ROW, not the shape of the product. Nothing here names a centre, a room or a
-- person. A second centre with different rooms, a different programme length and a different
-- doctor-review day is data entry, not a release.

create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table zones (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete restrict,
  name            text not null,
  code            text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, code)
);

create table centres (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete restrict,
  zone_id         uuid references zones(id) on delete set null,
  name            text not null,
  slug            text not null,
  timezone        text not null default 'Europe/London',
  is_active       boolean not null default true,

  -- Per-centre operational configuration. Mirrors src/domain/centre-settings.ts.
  -- Provisional values are marked with their open question in the docs, not here.
  settings        jsonb not null default jsonb_build_object(
                    'dischargeInclusiveOfAdmissionDay', true,   -- Q3
                    'defaultDurationDays',              28,
                    'familyMeetingEligibilityHours',    168,    -- Q13
                    'initialFamilyContactHours',        24,     -- Q12
                    'preDischargeContactHours',         24,
                    'doctorReviewWeekday',              4,      -- Q38
                    'defaultDeadlineTimeOfDay',         jsonb_build_object('hour', 17, 'minute', 0)
                  ),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, slug)
);

-- Composite unique keys so child tables can carry a denormalised centre_id/organisation_id and
-- have the database guarantee it matches. This is what makes cross-centre allocation impossible
-- rather than merely discouraged.
alter table centres add constraint centres_id_org_key unique (id, organisation_id);

create table rooms (
  id                  uuid primary key default gen_random_uuid(),
  centre_id           uuid not null references centres(id) on delete restrict,
  label               text not null,
  room_type           text not null default 'single' check (room_type in ('single','shared')),
  floor               text,
  accessibility_notes text,
  status              text not null default 'available'
                        check (status in ('available','maintenance','closed')),
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (centre_id, label)
);

alter table rooms add constraint rooms_id_centre_key unique (id, centre_id);

-- The BED is the allocatable unit, not the room.
--
-- The source whiteboard already works this way: rooms 6 and 9 appear only as 6A/6B and 9A/9B and
-- never as themselves. Modelling rooms as allocatable with a capacity counter cannot express
-- "6A is free but 6B is not".
create table beds (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete restrict,

  -- Denormalised from rooms, and forced to agree by the composite FK below. Needed because every
  -- RLS policy filters on centre, and joining up to rooms on every row check is expensive.
  centre_id   uuid not null,

  -- TEXT, never numeric. The workbook stores 14 room numbers as numbers and 4 as text ('6A','9B').
  -- A numeric column cannot hold '6A'; a mixed type invites 1 <> '1' bugs.
  label       text not null,

  status      text not null default 'available'
                check (status in ('available','maintenance','closed')),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (centre_id, label),
  foreign key (room_id, centre_id) references rooms(id, centre_id)
);

alter table beds add constraint beds_id_centre_key unique (id, centre_id);

create index beds_centre_sort_idx on beds (centre_id, sort_order);
create index rooms_centre_idx     on rooms (centre_id);
create index centres_zone_idx     on centres (zone_id);

create trigger touch_organisations before update on organisations
  for each row execute function app.touch_updated_at();
create trigger touch_zones before update on zones
  for each row execute function app.touch_updated_at();
create trigger touch_centres before update on centres
  for each row execute function app.touch_updated_at();
create trigger touch_rooms before update on rooms
  for each row execute function app.touch_updated_at();
create trigger touch_beds before update on beds
  for each row execute function app.touch_updated_at();

-- RLS is enabled in the SAME migration that creates the table. A table that exists for even one
-- migration without RLS is a table someone will forget. Policies arrive in 0012.
alter table organisations enable row level security;
alter table zones         enable row level security;
alter table centres       enable row level security;
alter table rooms         enable row level security;
alter table beds          enable row level security;

alter table organisations force row level security;
alter table zones         force row level security;
alter table centres       force row level security;
alter table rooms         force row level security;
alter table beds          force row level security;

comment on column beds.label is
  'Bed label as text (e.g. ''1'', ''6A''). Never numeric - the source data mixes both types.';
comment on column centres.settings is
  'Per-centre operational rules. See docs/BUSINESS_RULES.md; mirrors src/domain/centre-settings.ts.';
