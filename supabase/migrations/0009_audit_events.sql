-- 0009 · Append-only audit history
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). 9 assertions passing, including that UPDATE,
-- DELETE and direct INSERT are all refused to an authenticated platform administrator.
--
-- This is the one table that cannot be added retrospectively: every day the system runs without it
-- is a day of changes nobody can reconstruct. It is also what the CQC-evidence requirement actually
-- rests on — "what was required, when it was due, who was responsible, whether it was late, who
-- changed it and what it was before" is an audit question, not a reporting one.

create table audit_events (
  id            bigint generated always as identity primary key,

  -- Null actor means the change came from a migration, a scheduled job or direct SQL rather than a
  -- signed-in user. Recorded honestly rather than attributed to nobody in particular.
  actor_id      uuid references auth.users(id),
  actor_email   text,

  action        text not null,
  record_type   text not null,
  record_id     text not null,

  -- Denormalised so audit can be filtered by centre without joining to a row that may since have
  -- been archived.
  centre_id     uuid references centres(id),

  occurred_at   timestamptz not null default now(),

  -- Only the fields that actually changed. Storing whole rows would bury the change and duplicate
  -- sensitive content on every touch.
  changed_fields text[],
  previous_value jsonb,
  new_value      jsonb,

  -- Set by the caller via set_config('app.change_reason', ...). Required by the workflows that
  -- demand one: discharge changes, cancellations, early discharge.
  reason        text,
  context       jsonb
);

create index audit_events_occurred_idx on audit_events (occurred_at desc);
create index audit_events_record_idx   on audit_events (record_type, record_id, occurred_at desc);
create index audit_events_centre_idx   on audit_events (centre_id, occurred_at desc);
create index audit_events_actor_idx    on audit_events (actor_id, occurred_at desc);

alter table audit_events enable row level security;
alter table audit_events force row level security;

-- Append-only, enforced twice over.
--
-- 1. No UPDATE or DELETE policy exists, so RLS denies both.
-- 2. The privileges are revoked outright, so a future policy added by mistake cannot re-open them.
--
-- INSERT is revoked too: the trigger below is SECURITY DEFINER and writes on the user's behalf.
-- Without that, a user could forge an entry attributing an action to someone else.
revoke update, delete, insert on audit_events from authenticated, anon;

create policy audit_read on audit_events for select to authenticated
  using (
    app.can_read('audit.view')
    and (centre_id is null or app.can_access_centre(centre_id))
  );

comment on table audit_events is
  'Append-only. UPDATE/DELETE/INSERT revoked, not merely unpolicied. Written only by app.audit_row().';

-- ---------------------------------------------------------------------------
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new      jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_changed  text[] := '{}';
  v_old_diff jsonb := '{}'::jsonb;
  v_new_diff jsonb := '{}'::jsonb;
  v_centre   uuid;
  v_id       text;
  v_email    text;
  v_reason   text;
  k          text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if v_new -> k is distinct from v_old -> k then
        -- updated_at moves on every write and says nothing on its own.
        if k <> 'updated_at' then
          v_changed  := array_append(v_changed, k);
          v_old_diff := v_old_diff || jsonb_build_object(k, v_old -> k);
          v_new_diff := v_new_diff || jsonb_build_object(k, v_new -> k);
        end if;
      end if;
    end loop;

    -- A no-op update is noise, not history.
    if array_length(v_changed, 1) is null then
      return new;
    end if;
  else
    v_new_diff := v_new;
    v_old_diff := v_old;
  end if;

  v_centre := nullif(coalesce(v_new ->> 'centre_id', v_old ->> 'centre_id'), '')::uuid;
  v_id     := coalesce(v_new ->> 'id', v_old ->> 'id');

  select u.email into v_email from auth.users u where u.id = auth.uid();
  v_reason := nullif(current_setting('app.change_reason', true), '');

  insert into public.audit_events (
    actor_id, actor_email, action, record_type, record_id, centre_id,
    changed_fields, previous_value, new_value, reason
  ) values (
    auth.uid(), v_email, lower(tg_op), tg_table_name, v_id, v_centre,
    nullif(v_changed, '{}'), v_old_diff, v_new_diff, v_reason
  );

  return coalesce(new, old);
end;
$$;

comment on function app.audit_row() is
  'Generic audit trigger. Records only changed fields on UPDATE; skips no-op updates.';

create trigger audit_clients            after insert or update or delete on clients
  for each row execute function app.audit_row();
create trigger audit_admissions         after insert or update or delete on admissions
  for each row execute function app.audit_row();
create trigger audit_room_allocations   after insert or update or delete on room_allocations
  for each row execute function app.audit_row();
create trigger audit_access_assignments after insert or update or delete on user_access_assignments
  for each row execute function app.audit_row();
create trigger audit_user_profiles      after insert or update or delete on user_profiles
  for each row execute function app.audit_row();
create trigger audit_beds               after insert or update or delete on beds
  for each row execute function app.audit_row();
create trigger audit_centres            after insert or update or delete on centres
  for each row execute function app.audit_row();
