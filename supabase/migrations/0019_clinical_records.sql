-- 0019 · Family contact, meetings, detox, medical reviews, safeguarding, risk
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05). 19 assertions passing (see 0020).
--
-- These are the records the restricted flag has been pointing at with nothing behind it. Two things
-- shape the design:
--
-- 1. The indicator/detail split has to be real at row level, not just in the UI. A helpdesk user must
--    be able to know a safeguarding concern EXISTS while being unable to read a word of it.
-- 2. The seven-day family-meeting rule must be impossible to bypass, including through the API. A
--    CHECK constraint is the only thing that holds regardless of which client is calling.

-- Four kinds of family contact, kept separate on purpose: the brief is explicit that these must not
-- collapse into one generic field.
create table family_contacts (
  id            uuid primary key default gen_random_uuid(),
  admission_id  uuid not null,
  centre_id     uuid not null,
  task_id       uuid references client_tasks(id) on delete set null,

  contact_type  text not null check (contact_type in
                  ('within_24h','week_1','week_2','pre_discharge','ad_hoc')),
  method        text check (method in ('phone','email','in_person','video','letter')),

  contacted_at  timestamptz not null,
  contacted_by  uuid references user_profiles(id) on delete set null,

  -- Relationship rather than name where possible: a family member is a third party who has not
  -- consented to being recorded here.
  family_member_label text,
  outcome       text check (outcome in ('reached','no_answer','declined','left_message','other')),
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

create index family_contacts_admission_idx on family_contacts (admission_id, contacted_at desc);

-- `eligible_from` is stamped at creation from the admission and the centre's configured window.
-- Stored rather than recomputed on read: if a centre later changes its rule, meetings already booked
-- keep the rule that applied at the time. Recomputing would silently rewrite history and could
-- retrospectively make a lawful booking look unlawful.
create table family_meetings (
  id            uuid primary key default gen_random_uuid(),
  admission_id  uuid not null,
  centre_id     uuid not null,

  meeting_kind  text not null default 'meeting' check (meeting_kind in ('meeting','visit')),

  eligible_from timestamptz not null,
  scheduled_for timestamptz,
  actual_at     timestamptz,

  status        text not null default 'requested' check (status in
                  ('requested','scheduled','completed','cancelled','not_applicable')),

  attendees     text,
  staff_owner   uuid references user_profiles(id) on delete set null,
  outcome       text,
  cancellation_reason text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- THE seven-day rule. A CHECK, not application logic, because the brief requires that the API
  -- cannot be used to bypass it. Inclusive: a meeting at exactly the eligibility instant is allowed.
  constraint meeting_not_before_eligibility check (
    scheduled_for is null or scheduled_for >= eligible_from
  ),
  constraint actual_not_before_eligibility check (
    actual_at is null or actual_at >= eligible_from
  ),
  constraint completed_has_actual check (
    status <> 'completed' or actual_at is not null
  ),
  -- Closing without it happening always requires a reason. An early discharge before eligibility
  -- lands here, and must never be recorded as complete.
  constraint closed_has_reason check (
    status not in ('cancelled','not_applicable')
    or (cancellation_reason is not null and length(trim(cancellation_reason)) > 0)
  ),

  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

create index family_meetings_admission_idx on family_meetings (admission_id);
create index family_meetings_upcoming_idx on family_meetings (centre_id, scheduled_for)
  where status in ('requested','scheduled');

create table detox_records (
  id            uuid primary key default gen_random_uuid(),
  admission_id  uuid not null,
  centre_id     uuid not null,

  started_at    timestamptz,
  expected_end  date,
  actual_end    timestamptz,
  status        text not null default 'in_progress' check (status in
                  ('planned','in_progress','completed','not_required','discontinued')),

  regime_summary text,
  notes          text,
  recorded_by   uuid references user_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint detox_end_after_start check (actual_end is null or started_at is null or actual_end >= started_at),
  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

create index detox_admission_idx on detox_records (admission_id);
create index detox_active_idx on detox_records (centre_id, expected_end) where status = 'in_progress';

-- No hard-coded review weekday anywhere: `centres.settings.doctorReviewWeekday` decides. The
-- workbook baked "Thursday" into a column header, which is precisely the mistake not to repeat.
create table medical_review_requests (
  id            uuid primary key default gen_random_uuid(),
  admission_id  uuid not null,
  centre_id     uuid not null,

  reason        text not null,
  requested_by  uuid references user_profiles(id) on delete set null,
  requested_at  timestamptz not null default now(),
  intended_review_date date,
  assigned_doctor uuid references user_profiles(id) on delete set null,

  priority      text not null default 'routine' check (priority in ('routine','soon','urgent')),
  status        text not null default 'requested' check (status in
                  ('requested','scheduled','completed','cancelled')),

  outcome_summary text,
  completed_by  uuid references user_profiles(id) on delete set null,
  completed_at  timestamptz,

  visibility_level smallint not null default 3 check (visibility_level between 1 and 4),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint medical_completed_has_time check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

create index medical_reviews_admission_idx on medical_review_requests (admission_id);
create index medical_reviews_open_idx on medical_review_requests (centre_id, intended_review_date)
  where status in ('requested','scheduled');

-- Safeguarding and risk share a shape but stay separate tables: separate concerns, separate
-- permissions, and in most services separate escalation routes.
create table safeguarding_records (
  id            uuid primary key default gen_random_uuid(),
  admission_id  uuid not null,
  centre_id     uuid not null,

  category      text not null,
  summary       text not null,
  severity      text not null default 'medium' check (severity in ('low','medium','high','critical')),
  is_active     boolean not null default true,

  recorded_by   uuid references user_profiles(id) on delete set null,
  recorded_at   timestamptz not null default now(),
  reviewed_by   uuid references user_profiles(id) on delete set null,
  reviewed_at   timestamptz,
  resolved_at   timestamptz,
  resolution    text,

  visibility_level smallint not null default 3 check (visibility_level between 1 and 4),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint safeguarding_resolved_has_resolution check (
    resolved_at is null or (resolution is not null and length(trim(resolution)) > 0)
  ),
  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

create table risk_records (
  id            uuid primary key default gen_random_uuid(),
  admission_id  uuid not null,
  centre_id     uuid not null,

  category      text not null,
  summary       text not null,
  severity      text not null default 'medium' check (severity in ('low','medium','high','critical')),
  is_active     boolean not null default true,

  recorded_by   uuid references user_profiles(id) on delete set null,
  recorded_at   timestamptz not null default now(),
  reviewed_by   uuid references user_profiles(id) on delete set null,
  reviewed_at   timestamptz,
  resolved_at   timestamptz,
  resolution    text,

  visibility_level smallint not null default 3 check (visibility_level between 1 and 4),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint risk_resolved_has_resolution check (
    resolved_at is null or (resolution is not null and length(trim(resolution)) > 0)
  ),
  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

create index safeguarding_admission_idx on safeguarding_records (admission_id) where is_active;
create index safeguarding_centre_idx on safeguarding_records (centre_id, severity) where is_active;
create index risk_admission_idx on risk_records (admission_id) where is_active;
create index risk_centre_idx on risk_records (centre_id, severity) where is_active;

-- Triggers, RLS and delete revocation applied uniformly. Clinical history is never removed: close
-- it, resolve it, or mark it not applicable.
do $$
declare tbl text;
begin
  foreach tbl in array array['family_contacts','family_meetings','detox_records',
                             'medical_review_requests','safeguarding_records','risk_records']
  loop
    execute format('create trigger touch_%1$s before update on %1$I
                    for each row execute function app.touch_updated_at()', tbl);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I
                    for each row execute function app.audit_row()', tbl);
    execute format('alter table %I enable row level security', tbl);
    execute format('alter table %I force row level security', tbl);
    execute format('revoke delete on %I from authenticated, anon', tbl);
  end loop;
end;
$$;
