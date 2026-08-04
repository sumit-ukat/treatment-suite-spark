-- 0006 · Roles, permissions and scoped access assignments
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03). Enforcement verified — see 0007 and the test
-- results recorded in docs/CHANGELOG.md.
--
-- Two principles from the brief shape this:
--
-- 1. **Deny by default.** A user has no access until an assignment grants it. There is no
--    "authenticated users can read" fallback anywhere in the schema.
-- 2. **Access is a (role, scope) pair, not a column on the user.** The same person can be a therapist
--    at one centre and a supervisor at another, and temporary cover has to expire by itself rather
--    than by someone remembering to revoke it.

create table roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  description text not null,
  -- Sensitivity levels from docs/SECURITY_MODEL.md:
  -- 1 operational · 2 treatment coordination · 3 health/risk/safeguarding · 4 admin & security
  sensitivity_level smallint not null check (sensitivity_level between 1 and 4),
  created_at  timestamptz not null default now()
);

create table role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table user_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null,
  job_title     text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table user_access_assignments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references user_profiles(id) on delete cascade,
  role_id         uuid not null references roles(id) on delete restrict,

  scope_type      text not null check (scope_type in ('organisation','zone','centre')),
  organisation_id uuid references organisations(id) on delete cascade,
  zone_id         uuid references zones(id) on delete cascade,
  centre_id       uuid references centres(id) on delete cascade,

  -- Temporary cross-centre cover: reason, window, approver, automatic expiry.
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  reason          text,
  granted_by      uuid references auth.users(id),
  is_read_only    boolean not null default false,

  created_at      timestamptz not null default now(),

  -- Exactly one scope column, matching scope_type. Prevents an assignment that is ambiguous about
  -- what it actually grants.
  constraint scope_matches_type check (
    (scope_type = 'organisation' and organisation_id is not null and zone_id is null and centre_id is null)
    or (scope_type = 'zone'      and zone_id is not null and organisation_id is null and centre_id is null)
    or (scope_type = 'centre'    and centre_id is not null and organisation_id is null and zone_id is null)
  ),
  constraint assignment_window_valid check (ends_at is null or ends_at > starts_at)
);

create index uaa_user_idx   on user_access_assignments (user_id);
create index uaa_centre_idx on user_access_assignments (centre_id) where centre_id is not null;
create index uaa_zone_idx   on user_access_assignments (zone_id) where zone_id is not null;
create index uaa_active_idx on user_access_assignments (user_id, starts_at, ends_at);

create trigger touch_user_profiles before update on user_profiles
  for each row execute function app.touch_updated_at();

alter table roles                   enable row level security;
alter table permissions             enable row level security;
alter table role_permissions        enable row level security;
alter table user_profiles           enable row level security;
alter table user_access_assignments enable row level security;
alter table roles                   force row level security;
alter table permissions             force row level security;
alter table role_permissions        force row level security;
alter table user_profiles           force row level security;
alter table user_access_assignments force row level security;

comment on table user_access_assignments is
  'Scoped, expiring grants. A user may hold different roles at different centres.';
comment on column user_access_assignments.ends_at is
  'Temporary cover expires on its own. Null means open-ended.';
comment on column user_access_assignments.is_read_only is
  'Read-only assignments grant visibility but never write permission.';
