-- 0005 · Room and bed allocation history
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03). Double-booking, cross-centre allocation and
-- same-instant handover all verified against the live database.
--
-- Allocations are never updated in place and never deleted. A transfer ends one row and opens
-- another, so the complete occupancy history of every bed stays reconstructable — including who
-- moved a client, when, and why.

set local search_path = public, extensions;

create table room_allocations (
  id              uuid primary key default gen_random_uuid(),
  admission_id    uuid not null,
  bed_id          uuid not null,

  -- Denormalised, and forced to agree with BOTH parents by the composite FKs below. This is what
  -- makes allocating a client into another centre's bed impossible rather than merely incorrect.
  centre_id       uuid not null,

  started_at      timestamptz not null,
  ended_at        timestamptz,

  allocation_reason text,
  transfer_reason   text,
  notes             text,

  allocated_by    uuid references auth.users(id),
  ended_by        uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint allocation_ends_after_start check (ended_at is null or ended_at > started_at),

  foreign key (admission_id, centre_id) references admissions(id, centre_id),
  foreign key (bed_id, centre_id)       references beds(id, centre_id),

  -- Half-open [start, end): one client can leave a bed at 14:00 and the next arrive at exactly
  -- 14:00 without the ranges counting as overlapping. An open allocation runs to infinity.
  occupied_during tstzrange generated always as (
    tstzrange(started_at, ended_at, '[)')
  ) stored
);

-- The constraint that actually prevents two clients in one bed.
--
-- Not application logic, not a uniqueness check over "active" rows, not a transaction the code has
-- to remember. Postgres refuses the write outright. That distinction matters most under
-- concurrency: two admissions racing for the last bed cannot both succeed, which is precisely the
-- case a read-then-write check in application code lets through.
alter table room_allocations
  add constraint room_allocations_no_double_booking
  exclude using gist (bed_id with =, occupied_during with &&);

create index room_allocations_admission_idx on room_allocations (admission_id);
create index room_allocations_open_idx      on room_allocations (bed_id) where ended_at is null;
create index room_allocations_centre_idx    on room_allocations (centre_id, started_at desc);

create trigger touch_room_allocations before update on room_allocations
  for each row execute function app.touch_updated_at();

alter table room_allocations enable row level security;
alter table room_allocations force row level security;

comment on constraint room_allocations_no_double_booking on room_allocations is
  'Prevents overlapping occupancy of the same bed. Half-open ranges allow same-instant handover.';
