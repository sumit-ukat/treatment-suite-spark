-- 0033 · app.task_completer_names — who completed a task, resolvable without a user directory
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-11).
--
-- `client_tasks.completed_by` has held a real user id since migration 0026, but nothing could ever
-- display a name for it: `user_profiles` RLS (migration 0008) allows reading only yourself, or every
-- profile if you hold `administration.manage_users`. So a keyworker looking at a client file could see
-- that a task was completed but never by whom — the accountability half of the audit story was
-- unreachable from the screen where it matters.
--
-- Why not denormalise a label onto client_tasks the way audit_events does with actor_email: an audit
-- row is immutable history and a stale email in it is *correct* (it records who they were at the
-- time). A task is live state, and a copied display name would drift the moment someone's name
-- changed, with nothing to reconcile it against.
--
-- Scoped deliberately so this cannot become a general user directory. It returns names only for users
-- who actually completed a client_task at the requested centre, and only to a caller who can already
-- read that centre's tasks. Staff names at that centre are not new information to such a caller: the
-- room board already shows focal therapist, keyworker and buddy labels beside every occupant.
--
-- `can_read` rather than `has_permission`: reading who completed something is a read, and a read-only
-- assignment (user_access_assignments.is_read_only) should not be denied it — same distinction
-- migration 0028 makes for search.
create or replace function app.task_completer_names(p_centre_id uuid)
returns table (
  user_id uuid,
  display_name text
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
    select distinct up.id, up.display_name
    from public.user_profiles up
    where exists (
      select 1
      from public.client_tasks ct
      where ct.completed_by = up.id
        and ct.centre_id = p_centre_id
    );
end;
$$;

comment on function app.task_completer_names is
  'Display names for users who have completed a task at one centre. Needs tasks.view and access to that centre. Deliberately not a general user lookup: a user who has completed nothing at this centre is never returned.';

create or replace function public.task_completer_names(p_centre_id uuid)
returns table (
  user_id uuid,
  display_name text
)
language sql
security invoker
set search_path = ''
as $$
  select * from app.task_completer_names(p_centre_id);
$$;

comment on function public.task_completer_names is
  'Thin PostgREST-visible wrapper over app.task_completer_names. All checks and logic live in the app schema.';

grant execute on function app.task_completer_names(uuid) to authenticated;
grant execute on function public.task_completer_names(uuid) to authenticated;
