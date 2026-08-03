-- 0004 · Clients, admissions and substances
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03). Constraints verified — see the test results
-- recorded in docs/CHANGELOG.md for this date.
--
-- The permanent client record is separate from any one stay, because a client may return for a
-- second episode. The whiteboard cannot express this at all: a row is a bed, so a client ceases to
-- exist on discharge and a returning client is indistinguishable from a new one.

create table substances (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete restrict,
  name            text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organisation_id, name)
);

create table clients (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete restrict,

  -- A stable identifier. The workbook has none: the name is the only key, so it cannot distinguish
  -- two people with the same name, nor recognise someone returning for a second admission.
  reference       text not null,

  first_name      text not null,
  last_name       text not null,
  preferred_name  text,
  date_of_birth   date,

  status          text not null default 'active' check (status in ('active','archived')),

  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id),

  unique (organisation_id, reference)
);

alter table clients add constraint clients_id_org_key unique (id, organisation_id);

create table admissions (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete restrict,
  centre_id             uuid not null references centres(id) on delete restrict,
  organisation_id       uuid not null,

  admitted_at           timestamptz not null,
  status                text not null default 'active'
                          check (status in ('planned','active','discharged','cancelled')),

  planned_duration       integer not null check (planned_duration > 0),
  planned_duration_unit  text not null default 'days'
                           check (planned_duration_unit in ('days','weeks')),

  -- Three distinct dates, not one mutable field.
  --
  -- The workbook holds a single discharge date. One row shows a 28-day programme against a 57-day
  -- stay: the plan was extended, but the original intent, the reason, the author and the date of the
  -- change are all gone. Hence original (immutable), current (changeable with a logged reason),
  -- actual (set once, at discharge).
  original_planned_discharge_date date not null,
  current_planned_discharge_date  date not null,
  actual_discharge_at             timestamptz,

  discharge_type        text check (discharge_type in ('planned','early','transfer','other')),

  treatment_group       text,
  primary_substance_id  uuid references substances(id) on delete set null,
  peep_required         boolean not null default false,

  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id),

  constraint discharge_fields_consistent check (
    (status = 'discharged' and actual_discharge_at is not null and discharge_type is not null)
    or (status <> 'discharged' and actual_discharge_at is null)
  ),
  constraint discharge_after_admission check (
    actual_discharge_at is null or actual_discharge_at >= admitted_at
  ),

  -- The client and the centre must belong to the same organisation as this admission.
  foreign key (client_id, organisation_id) references clients(id, organisation_id),
  foreign key (centre_id, organisation_id) references centres(id, organisation_id)
);

-- Required by room_allocations' composite FK, which is what blocks cross-centre allocation.
alter table admissions add constraint admissions_id_centre_key unique (id, centre_id);

-- At most one live admission per client — enforced by the database, not by application care.
create unique index admissions_one_open_per_client
  on admissions (client_id)
  where status in ('planned','active');

create index admissions_centre_status_idx     on admissions (centre_id, status);
create index admissions_current_discharge_idx on admissions (current_planned_discharge_date)
  where status = 'active';
create index admissions_client_idx            on admissions (client_id);
create index clients_org_reference_idx        on clients (organisation_id, reference);

create trigger touch_clients before update on clients
  for each row execute function app.touch_updated_at();
create trigger touch_admissions before update on admissions
  for each row execute function app.touch_updated_at();

-- BR-8: the original planned discharge date can never be rewritten.
--
-- A trigger rather than a convention. This field is what makes an extension visible after the fact,
-- and it is the one value that cannot be reconstructed later. If it is editable it will be edited.
create or replace function app.forbid_original_discharge_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.original_planned_discharge_date is distinct from old.original_planned_discharge_date then
    raise exception
      'original_planned_discharge_date is immutable (was %, attempted %). Change current_planned_discharge_date instead, with a reason.',
      old.original_planned_discharge_date, new.original_planned_discharge_date
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger admissions_protect_original_discharge
  before update on admissions
  for each row execute function app.forbid_original_discharge_change();

alter table substances  enable row level security;
alter table clients     enable row level security;
alter table admissions  enable row level security;
alter table substances  force row level security;
alter table clients     force row level security;
alter table admissions  force row level security;

comment on column admissions.original_planned_discharge_date is
  'Immutable (trigger-enforced). The plan at admission, preserved so extensions stay visible.';
comment on index admissions_one_open_per_client is
  'At most one planned/active admission per client.';
