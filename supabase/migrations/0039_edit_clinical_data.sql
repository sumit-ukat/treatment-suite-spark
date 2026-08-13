-- 0039 · Edit clinical data — admission notes, safeguarding notes, task due dates
--
-- Adds three write paths that were deliberately absent until now:
--   1. Admission notes — a proper field on admissions (replacing the legacy allocation_reason hack).
--   2. Safeguarding / concern note editing — staff can correct a typo or add detail, with a full
--      audit trail of who made the change and when.
--   3. Task rescheduling — moving a task's due date, which migration 0026 blocked at the direct-
--      UPDATE level. This RPC enforces a mandatory reason and writes every change to task_date_changes
--      so "someone moved their own deadline" is impossible to hide.

-- ─── 1. Admission notes ───────────────────────────────────────────────────────

alter table public.admissions
  add column if not exists admission_notes            text,
  add column if not exists admission_notes_updated_by uuid references auth.users(id),
  add column if not exists admission_notes_updated_at timestamptz;

-- ─── 2. Concern note edit audit ───────────────────────────────────────────────

alter table public.client_concerns
  add column if not exists updated_by      uuid references auth.users(id),
  add column if not exists updated_by_name text,
  add column if not exists updated_at      timestamptz;

-- ─── 3. Task date change log ──────────────────────────────────────────────────

create table if not exists public.task_date_changes (
  id             uuid        primary key default gen_random_uuid(),
  task_id        uuid        not null references public.client_tasks(id) on delete cascade,
  old_due_at     timestamptz,
  new_due_at     timestamptz not null,
  reason         text        not null check (char_length(trim(reason)) > 0),
  changed_by     uuid        not null references auth.users(id),
  changed_by_name text,
  changed_at     timestamptz not null default now()
);

create index if not exists task_date_changes_task_idx on public.task_date_changes (task_id, changed_at desc);

alter table public.task_date_changes enable row level security;

create policy "Centre members can read task date changes"
  on public.task_date_changes for select
  using (
    exists (
      select 1 from public.client_tasks t
      where t.id = task_date_changes.task_id
        and app.can_access_centre(t.centre_id)
    )
  );

-- ─── 4. RPC: update_admission_notes ──────────────────────────────────────────

create or replace function app.update_admission_notes(p_admission_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admissions a
    where a.id = p_admission_id and app.can_access_centre(a.centre_id)
  ) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  update public.admissions set
    admission_notes            = nullif(btrim(coalesce(p_notes, '')), ''),
    admission_notes_updated_by = auth.uid(),
    admission_notes_updated_at = now()
  where id = p_admission_id;
end;
$$;

create or replace function public.update_admission_notes(p_admission_id uuid, p_notes text)
returns void language sql security invoker set search_path = ''
as $$ select app.update_admission_notes(p_admission_id, p_notes); $$;

grant execute on function app.update_admission_notes(uuid, text) to authenticated;
grant execute on function public.update_admission_notes(uuid, text) to authenticated;

comment on function app.update_admission_notes is
  'Set or clear the clinical notes on an admission. Tracks who edited and when.';

-- ─── 5. RPC: update_concern_note ─────────────────────────────────────────────

create or replace function app.update_concern_note(p_concern_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_centre_id    uuid;
  v_display_name text;
begin
  select centre_id into v_centre_id
  from public.client_concerns where id = p_concern_id;

  if not found or not app.can_access_centre(v_centre_id) then
    raise exception 'Concern not found' using errcode = 'P0002';
  end if;

  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'Note cannot be blank' using errcode = '22023';
  end if;

  select display_name into v_display_name from public.user_profiles where id = auth.uid();

  update public.client_concerns set
    note            = btrim(p_note),
    updated_by      = auth.uid(),
    updated_by_name = coalesce(v_display_name, 'Staff'),
    updated_at      = now()
  where id = p_concern_id;
end;
$$;

create or replace function public.update_concern_note(p_concern_id uuid, p_note text)
returns void language sql security invoker set search_path = ''
as $$ select app.update_concern_note(p_concern_id, p_note); $$;

grant execute on function app.update_concern_note(uuid, text) to authenticated;
grant execute on function public.update_concern_note(uuid, text) to authenticated;

comment on function app.update_concern_note is
  'Amend the text of a concern. Records who made the change in updated_by_name / updated_at.';

-- ─── 6. Update list_concerns to surface edit info ────────────────────────────

drop function if exists app.list_concerns(uuid, uuid);
drop function if exists public.list_concerns(uuid, uuid);

create or replace function app.list_concerns(p_centre_id uuid, p_client_id uuid)
returns table (
  id             uuid,
  note           text,
  category       text,
  logged_by_name text,
  logged_at      timestamptz,
  is_resolved    boolean,
  resolved_note  text,
  resolved_at    timestamptz,
  updated_by_name text,
  updated_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  return query
    select
      cc.id,
      cc.note,
      cc.category,
      coalesce(up.display_name, 'Staff') as logged_by_name,
      cc.logged_at,
      cc.is_resolved,
      cc.resolved_note,
      cc.resolved_at,
      cc.updated_by_name,
      cc.updated_at
    from public.client_concerns cc
    left join public.user_profiles up on up.id = cc.logged_by
    where cc.centre_id = p_centre_id
      and cc.client_id = p_client_id
    order by cc.logged_at desc;
end;
$$;

create or replace function public.list_concerns(p_centre_id uuid, p_client_id uuid)
returns table (
  id             uuid,
  note           text,
  category       text,
  logged_by_name text,
  logged_at      timestamptz,
  is_resolved    boolean,
  resolved_note  text,
  resolved_at    timestamptz,
  updated_by_name text,
  updated_at      timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from app.list_concerns(p_centre_id, p_client_id); $$;

grant execute on function app.list_concerns(uuid, uuid) to authenticated;
grant execute on function public.list_concerns(uuid, uuid) to authenticated;

-- ─── 7. RPC: reschedule_task ─────────────────────────────────────────────────

create or replace function app.reschedule_task(
  p_task_id    uuid,
  p_new_due_at timestamptz,
  p_reason     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task         public.client_tasks;
  v_reason       text := nullif(btrim(coalesce(p_reason, '')), '');
  v_display_name text;
begin
  if not app.has_permission('tasks.complete') then
    raise exception 'Not permitted to reschedule tasks' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'A reason is required when rescheduling a task' using errcode = '22023';
  end if;

  select * into v_task from public.client_tasks where id = p_task_id;

  if v_task.id is null or not app.can_access_centre(v_task.centre_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  select display_name into v_display_name from public.user_profiles where id = auth.uid();

  -- Audit log first — if the update fails, neither row persists.
  insert into public.task_date_changes (task_id, old_due_at, new_due_at, reason, changed_by, changed_by_name)
  values (p_task_id, v_task.due_at, p_new_due_at, v_reason, auth.uid(), coalesce(v_display_name, 'Staff'));

  update public.client_tasks set
    due_at     = p_new_due_at,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_task_id;
end;
$$;

create or replace function public.reschedule_task(
  p_task_id    uuid,
  p_new_due_at timestamptz,
  p_reason     text
)
returns void language sql security invoker set search_path = ''
as $$ select app.reschedule_task(p_task_id, p_new_due_at, p_reason); $$;

grant execute on function app.reschedule_task(uuid, timestamptz, text) to authenticated;
grant execute on function public.reschedule_task(uuid, timestamptz, text) to authenticated;

comment on function app.reschedule_task is
  'Move a task due date. Mandatory reason; every change logged to task_date_changes. Uses the same security-definer pattern as complete/reopen so UPDATE on client_tasks stays fully revoked.';

-- ─── 8. RPC: task_date_history ────────────────────────────────────────────────

create or replace function app.task_date_history(p_task_id uuid)
returns table (
  id              uuid,
  old_due_at      timestamptz,
  new_due_at      timestamptz,
  reason          text,
  changed_by_name text,
  changed_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.client_tasks t
    where t.id = p_task_id and app.can_access_centre(t.centre_id)
  ) then
    return;
  end if;

  return query
    select tdc.id, tdc.old_due_at, tdc.new_due_at, tdc.reason, tdc.changed_by_name, tdc.changed_at
    from public.task_date_changes tdc
    where tdc.task_id = p_task_id
    order by tdc.changed_at desc;
end;
$$;

create or replace function public.task_date_history(p_task_id uuid)
returns table (
  id              uuid,
  old_due_at      timestamptz,
  new_due_at      timestamptz,
  reason          text,
  changed_by_name text,
  changed_at      timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from app.task_date_history(p_task_id); $$;

grant execute on function app.task_date_history(uuid) to authenticated;
grant execute on function public.task_date_history(uuid) to authenticated;

comment on function app.task_date_history is
  'All due-date changes for a task, newest first.';
