-- 0010 · Staff and peer assignments
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). 10 assertions passing.
--
-- Until now therapist, buddy and doctor were strings on a card. That made three things impossible,
-- all of which the brief asks for: filtering a board by therapist, computing real workload, and
-- knowing when an assignment changed and why.
--
-- On "buddy": in the source workbook one of the six buddy values is also the name of a client on the
-- same board, and every buddy value is a first name only — exactly like the therapist values. That
-- points to buddies being PEER CLIENTS rather than staff. One overlap in six is suggestive, not
-- conclusive, and recording a client as a staff member would be a meaningful error: it would put them
-- in workload figures and imply they need a login. So this table refuses to guess. `assignee_kind`
-- carries the answer and 'unresolved' is a legitimate state for an imported row where only a name is
-- known. See OPEN_QUESTIONS Q41.

create table staff_assignments (
  id              uuid primary key default gen_random_uuid(),
  admission_id    uuid not null,
  centre_id       uuid not null,

  role_code       text not null check (role_code in ('focal_therapist','buddy','doctor','key_worker')),

  assignee_kind   text not null default 'unresolved'
                    check (assignee_kind in ('staff','peer','unresolved')),
  staff_user_id     uuid references user_profiles(id) on delete restrict,
  peer_admission_id uuid references admissions(id) on delete restrict,

  -- The source value, kept verbatim, so an imported assignment stays visible before anyone has
  -- matched the name to a person.
  display_label   text,

  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  assigned_by     uuid references auth.users(id),
  reason          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Strictly greater: a zero-length assignment records nothing. Note this means ending an assignment
  -- created in the same transaction needs an explicit later timestamp, since now() is frozen for the
  -- transaction's duration.
  constraint assignment_window_valid check (ended_at is null or ended_at > started_at),

  constraint assignee_matches_kind check (
    (assignee_kind = 'staff'      and staff_user_id is not null and peer_admission_id is null)
    or (assignee_kind = 'peer'    and peer_admission_id is not null and staff_user_id is null)
    or (assignee_kind = 'unresolved' and staff_user_id is null and peer_admission_id is null
        and display_label is not null)
  ),

  constraint peer_is_not_self check (peer_admission_id is null or peer_admission_id <> admission_id),

  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

-- One live assignment per role per admission. Replacing a therapist means ending one and opening
-- another, which is exactly what preserves the history.
create unique index staff_assignments_one_open_per_role
  on staff_assignments (admission_id, role_code)
  where ended_at is null;

create index staff_assignments_admission_idx   on staff_assignments (admission_id);
create index staff_assignments_centre_role_idx on staff_assignments (centre_id, role_code) where ended_at is null;
-- Supports "how many clients does this therapist hold right now".
create index staff_assignments_workload_idx    on staff_assignments (staff_user_id, role_code) where ended_at is null;

create trigger touch_staff_assignments before update on staff_assignments
  for each row execute function app.touch_updated_at();

create trigger audit_staff_assignments after insert or update or delete on staff_assignments
  for each row execute function app.audit_row();

alter table staff_assignments enable row level security;
alter table staff_assignments force row level security;

create policy staff_assignments_read on staff_assignments for select to authenticated
  using (app.can_access_centre(centre_id));

create policy staff_assignments_write on staff_assignments for all to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('admission.manage'))
  with check (app.can_access_centre(centre_id) and app.has_permission('admission.manage'));

comment on column staff_assignments.assignee_kind is
  'staff | peer | unresolved. Buddies may be peer clients rather than staff - OPEN_QUESTIONS Q41.';
comment on column staff_assignments.display_label is
  'Verbatim source value, retained so an imported assignment is visible before the name is matched.';
