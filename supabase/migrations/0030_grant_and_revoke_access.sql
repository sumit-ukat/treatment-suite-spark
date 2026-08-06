-- 0030 · app.grant_access / app.revoke_access — the users-and-roles admin screen's writes
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-06).
--
-- The gap: every permission check in this system depends on `user_access_assignments`, and until now
-- the only way a row was ever created in it was a direct SQL insert run by hand — every fictional test
-- user in this project's history has been onboarded that way. There has never been a UI for it.
--
-- IMPORTANT SCOPE NOTE, stated plainly rather than glossed over: this closes ONE of the two gaps
-- blocking real staff onboarding, not both. `user_access_assignments.user_id` references
-- `user_profiles.id`, which references `auth.users.id` — a role can only be granted to someone who
-- already has a Supabase Auth login. Creating that login (`supabase.auth.admin.createUser` or an
-- invite) needs the service_role key, which this project's standing rule forbids ever reaching the
-- browser. That needs a Supabase Edge Function — genuinely different infrastructure, not something to
-- smuggle into this migration. So: this makes it possible to grant/revoke a role for someone who
-- already has a login (e.g. created via the Supabase dashboard today); it does not create logins.
--
-- Why RPCs at all, when `user_access_assignments` already has a working RLS write path
-- (`assignments_write`, gated on `administration.manage_users`) that would let a direct insert/update
-- succeed today: two things RLS cannot do that matter here.
--   1. `app.audit_row`'s reason column is populated from the `app.change_reason` GUC, which only
--      survives within a single transaction. PostgREST does not guarantee two separate table/RPC calls
--      share one transaction, so a raw client-side UPDATE has no reliable way to get a reason into the
--      audit trail at all. A wrapping function can set the GUC and do the write in the same statement.
--   2. The lockout guard below cannot be expressed as a row-level policy: whether a specific revoke is
--      safe depends on every OTHER row in the table, which RLS's per-row `USING` clause cannot see.
--
-- The lockout guard: revoking an assignment that is the SYSTEM'S LAST active, non-read-only grant of
-- `administration.manage_users` is refused outright. Without this, a slip — revoking your own access,
-- or the only other admin's — leaves nobody able to manage user access at all, recoverable only by a
-- direct database console session outside this app. The guard checks system-wide, not just "not your
-- own", because the danger is the same regardless of whose assignment it is.
--
-- Deliberately NOT built: any way to create a new role or permission. `roles`, `permissions` and
-- `role_permissions` have no write RLS policy at all (checked directly: FORCE ROW LEVEL SECURITY with
-- no INSERT/UPDATE/DELETE policy denies everything) — they are a fixed, migration-seeded catalog by
-- design, and this screen only ever assigns an EXISTING role to a user. Adding a role is a code change,
-- not an admin action, and nothing here tries to make it one.
--
-- Deliberately simplified: a centre-scoped grant requires the granter to already reach that centre
-- (`app.can_access_centre`), but a zone- or organisation-scoped grant has no equivalent escalation
-- check beyond holding `administration.manage_users` itself. Only `platform_admin` holds that
-- permission today, and it is organisation-scoped, so this never bites in practice yet — but it would
-- if a future, narrower admin role held it. Worth revisiting before that happens, not before.
create or replace function app.grant_access(
  p_user_id       uuid,
  p_role_id       uuid,
  p_scope_type    text,
  p_scope_id      uuid,
  p_reason        text,
  p_is_read_only  boolean default false,
  p_ends_at       timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if not app.has_permission('administration.manage_users') then
    raise exception 'Not permitted to manage user access' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'A reason is required to grant access' using errcode = '22023';
  end if;

  if p_scope_type not in ('organisation', 'zone', 'centre') then
    raise exception 'Not a valid scope type: %', p_scope_type using errcode = '22023';
  end if;

  if not exists (select 1 from public.user_profiles where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'Role not found' using errcode = 'P0002';
  end if;

  if p_scope_type = 'centre' then
    if not exists (select 1 from public.centres where id = p_scope_id) then
      raise exception 'Centre not found' using errcode = 'P0002';
    end if;
    if not app.can_access_centre(p_scope_id) then
      raise exception 'Cannot grant access to a centre you cannot yourself reach' using errcode = '42501';
    end if;
  elsif p_scope_type = 'zone' then
    if not exists (select 1 from public.zones where id = p_scope_id) then
      raise exception 'Zone not found' using errcode = 'P0002';
    end if;
  else
    if not exists (select 1 from public.organisations where id = p_scope_id) then
      raise exception 'Organisation not found' using errcode = 'P0002';
    end if;
  end if;

  perform set_config('app.change_reason', v_reason, true);

  insert into public.user_access_assignments (
    user_id, role_id, scope_type,
    organisation_id, zone_id, centre_id,
    is_read_only, ends_at, reason, granted_by
  )
  values (
    p_user_id, p_role_id, p_scope_type,
    case when p_scope_type = 'organisation' then p_scope_id end,
    case when p_scope_type = 'zone' then p_scope_id end,
    case when p_scope_type = 'centre' then p_scope_id end,
    p_is_read_only, p_ends_at, v_reason, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.grant_access is
  'Grants an existing role to an existing user at a chosen scope. Requires administration.manage_users. Does not create logins — see this migration''s header for the Edge Function gap that does.';

create or replace function app.revoke_access(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment    public.user_access_assignments;
  v_reason        text := nullif(btrim(coalesce(p_reason, '')), '');
  v_grants_admin  boolean;
  v_other_exists  boolean;
  -- clock_timestamp(), not now(): now()/transaction_timestamp() is fixed for the whole transaction,
  -- so a grant and its revoke landing in the same transaction — unlikely from two separate real
  -- requests, but exactly what this migration's own test does — would otherwise compute the same
  -- instant for both, which as a first attempt caused two different failures: the raw value tripped
  -- assignment_window_valid (ends_at not strictly after starts_at), and a naive forward-clamp to fix
  -- that then made the "already ended" check below compare against a stale, non-advancing `now()` and
  -- wrongly allow revoking the same assignment twice. clock_timestamp() reads the real wall clock at
  -- each call, so both the check and the write use a value that has actually moved forward.
  v_ends_at       timestamptz := clock_timestamp();
begin
  if not app.has_permission('administration.manage_users') then
    raise exception 'Not permitted to manage user access' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'A reason is required to revoke access' using errcode = '22023';
  end if;

  select * into v_assignment from public.user_access_assignments where id = p_assignment_id;
  if v_assignment.id is null then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  if v_assignment.ends_at is not null and v_assignment.ends_at <= v_ends_at then
    raise exception 'This assignment has already ended' using errcode = '22023';
  end if;

  -- The lockout guard. Only worth the extra query when this assignment could actually matter — most
  -- revokes are an ordinary centre-scoped role with no bearing on who can administer users at all.
  select exists (
    select 1 from public.role_permissions rp
    join public.permissions perm on perm.id = rp.permission_id
    where rp.role_id = v_assignment.role_id and perm.code = 'administration.manage_users'
  ) and not v_assignment.is_read_only
  into v_grants_admin;

  if v_grants_admin then
    -- v_ends_at (clock_timestamp()), not now(), for the SAME reason as the self-check above: a prior
    -- revoke earlier in this same transaction set some other row's ends_at via clock_timestamp(),
    -- which — being real wall-clock time — is always >= this transaction's frozen now(). Comparing
    -- against now() here would make that just-revoked row look still-active and let this guard miss
    -- the exact scenario it exists to catch, for anything that revokes more than one assignment in a
    -- single transaction (a bulk-revoke action, a script). Caught by this migration's own test.
    select exists (
      select 1 from public.user_access_assignments a2
      join public.role_permissions rp on rp.role_id = a2.role_id
      join public.permissions perm on perm.id = rp.permission_id
      where perm.code = 'administration.manage_users'
        and not a2.is_read_only
        and a2.starts_at <= v_ends_at
        and (a2.ends_at is null or a2.ends_at > v_ends_at)
        and a2.id <> p_assignment_id
    ) into v_other_exists;

    if not v_other_exists then
      raise exception
        'Cannot revoke the last active assignment granting administration.manage_users — that would leave no one able to manage user access'
        using errcode = '42501';
    end if;
  end if;

  -- Belt-and-braces: clock_timestamp() advancing past starts_at is what happens in every real case,
  -- but a same-transaction test can still call both fast enough to tie. Never fails a real revoke.
  if v_ends_at <= v_assignment.starts_at then
    v_ends_at := v_assignment.starts_at + interval '1 microsecond';
  end if;

  perform set_config('app.change_reason', v_reason, true);

  update public.user_access_assignments
     set ends_at = v_ends_at
   where id = p_assignment_id;
end;
$$;

comment on function app.revoke_access is
  'Ends an access assignment now (does not delete the row — the history stays). Requires administration.manage_users, a reason, and refuses to remove the system''s last active grant of administration.manage_users.';

create or replace function public.grant_access(
  p_user_id uuid, p_role_id uuid, p_scope_type text, p_scope_id uuid,
  p_reason text, p_is_read_only boolean default false, p_ends_at timestamptz default null
)
returns uuid
language sql security invoker set search_path = ''
as $$
  select app.grant_access(p_user_id, p_role_id, p_scope_type, p_scope_id, p_reason, p_is_read_only, p_ends_at);
$$;

create or replace function public.revoke_access(p_assignment_id uuid, p_reason text)
returns void
language sql security invoker set search_path = ''
as $$
  select app.revoke_access(p_assignment_id, p_reason);
$$;

grant execute on function app.grant_access(uuid, uuid, text, uuid, text, boolean, timestamptz) to authenticated;
grant execute on function app.revoke_access(uuid, text) to authenticated;
grant execute on function public.grant_access(uuid, uuid, text, uuid, text, boolean, timestamptz) to authenticated;
grant execute on function public.revoke_access(uuid, text) to authenticated;
