-- 0034 · app.task_reopen_history — surfacing why a task was reopened, where the work is done
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-11).
--
-- `app.reopen_client_task` (migration 0026) demands a reason precisely because undoing a completion
-- record is "exactly the change an audit trail exists to explain" — and then writes that reason to
-- `audit_events.reason` and clears the completion columns off the task row. Correct, but it means the
-- reason has been invisible from the one screen where it changes a decision: the client file shows a
-- task sitting incomplete with no indication it was ever done, by whom, or why that was undone. The
-- record existed; nothing could read it.
--
-- Not readable directly: `audit_events` RLS requires `audit.view`, a level-4 permission held by
-- administrators, not by the keyworker looking at their own client's tasks. Rather than widen that
-- policy — audit history is genuinely sensitive in aggregate, since it spans every table — this
-- returns the single narrow slice that belongs on a task row, to a caller who can already read that
-- centre's tasks.
--
-- A reopen is identified by what actually happened to the row, not by a flag: status left 'completed'
-- and did not arrive back at it. That is exactly the state transition `reopen_client_task` performs
-- and the only thing that performs it, since UPDATE on client_tasks is revoked from `authenticated`
-- (migration 0026) — so this cannot be spoofed by a direct PATCH, and cannot miss a reopen done
-- through the only path that exists.
--
-- Every reopen is returned, not just the most recent: a task reopened twice is a different and more
-- interesting fact than a task reopened once, and collapsing that would hide it.
create or replace function app.task_reopen_history(p_centre_id uuid)
returns table (
  task_id uuid,
  occurred_at timestamptz,
  actor_label text,
  reason text
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

  if not app.can_read('tasks.view') then
    return;
  end if;

  return query
    select
      ae.record_id::uuid,
      ae.occurred_at,
      -- The profile name when the actor still has one, falling back to the email captured on the
      -- event itself. audit_events denormalises actor_email at write time precisely so history stays
      -- readable after a profile changes or goes away.
      coalesce(up.display_name, ae.actor_email),
      ae.reason
    from public.audit_events ae
    left join public.user_profiles up on up.id = ae.actor_id
    where ae.record_type = 'client_tasks'
      and ae.action = 'update'
      and ae.centre_id = p_centre_id
      and ae.previous_value ->> 'status' = 'completed'
      and ae.new_value ->> 'status' is distinct from 'completed'
    order by ae.occurred_at desc;
end;
$$;

comment on function app.task_reopen_history is
  'Every reopen of a task at one centre — when, by whom, and the reason required by app.reopen_client_task. Needs tasks.view and access to the centre; deliberately narrower than audit.view, which spans every table.';

create or replace function public.task_reopen_history(p_centre_id uuid)
returns table (
  task_id uuid,
  occurred_at timestamptz,
  actor_label text,
  reason text
)
language sql
security invoker
set search_path = ''
as $$
  select * from app.task_reopen_history(p_centre_id);
$$;

comment on function public.task_reopen_history is
  'Thin PostgREST-visible wrapper over app.task_reopen_history. All checks and logic live in the app schema.';

grant execute on function app.task_reopen_history(uuid) to authenticated;
grant execute on function public.task_reopen_history(uuid) to authenticated;
