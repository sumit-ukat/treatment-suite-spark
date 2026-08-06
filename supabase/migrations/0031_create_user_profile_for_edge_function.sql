-- 0031 · app.create_user_profile — the database side of real account creation
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-06).
--
-- Migration 0030 closed half of "onboard real staff": granting/revoking a role, for someone who
-- already has a Supabase Auth login. This closes the other half — creating that login — via a
-- Supabase Edge Function (`supabase/functions/invite-user/`), the one piece of infrastructure that
-- can hold the `service_role` key, which this project's standing rule forbids ever reaching the
-- browser. The Edge Function calls `supabase.auth.admin.inviteUserByEmail()` to create the
-- `auth.users` row and send the invite (the new person sets their own password — no admin ever
-- handles one), then calls this function to create the matching `user_profiles` row.
--
-- Why this needs its own function rather than a plain insert from the Edge Function's service-role
-- client: two things.
--   1. Attribution. The service-role Postgres connection carries no `sub` claim — `auth.uid()`
--      resolves to null on it — so `app.audit_row`'s actor_id would be null for a plain insert,
--      losing WHO invited this person. This function is handed the real actor's id (the Edge
--      Function verified it from the caller's own JWT before ever using the service-role key) and
--      sets the `request.jwt.claims` GUC to it before the insert, in the same statement, so the audit
--      trail attributes correctly. This is the same GUC-setting pattern already used for
--      `app.change_reason` — applied here to the actor instead of the reason.
--   2. A second, independent permission check. The Edge Function already checks the caller's
--      permission via their own JWT before calling this — but a service-role connection bypasses RLS
--      and would bypass a JWT-based check entirely if this function trusted the caller blindly. This
--      function re-checks `p_actor_id` directly against `user_access_assignments`, so even a bug in
--      the Edge Function's own check cannot turn into a privilege escalation here. Never trust the
--      application layer alone — the database is the one that actually enforces this everywhere else
--      in this project, and account creation is not an exception.
--
-- Reachability, deliberately narrow: `public.create_user_profile` exists (PostgREST does not expose
-- `app`, so a wrapper is required — migration 0024) but is granted ONLY to `service_role`, never to
-- `authenticated` or `anon`. An ordinary signed-in user cannot call this even by guessing its name;
-- only the Edge Function's service-role connection can reach it.
--
-- A real trap, found live while applying this exact migration, worth stating so it is not repeated:
-- `revoke all on function ... from public` does NOT remove `authenticated`/`anon`'s ability to call a
-- new function here. This Supabase project has a default-privileges rule that grants EXECUTE on every
-- new `public` function to `anon` and `authenticated` directly (so a fresh function is callable via
-- PostgREST without extra setup) — those are direct grants to those roles, not grants inherited via
-- the `PUBLIC` pseudo-role, so revoking from `PUBLIC` never touches them. Confirmed directly: after
-- the `revoke all ... from public` below, `information_schema.role_routine_grants` still listed
-- `authenticated` and `anon` with EXECUTE. The only fix is revoking from those two roles by name,
-- which is what actually appears below.
create or replace function app.create_user_profile(
  p_user_id      uuid,
  p_email        text,
  p_display_name text,
  p_job_title    text,
  p_actor_id     uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.user_access_assignments a
    join public.user_profiles p on p.id = a.user_id and p.is_active
    join public.role_permissions rp on rp.role_id = a.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where a.user_id = p_actor_id
      and a.starts_at <= now()
      and (a.ends_at is null or a.ends_at > now())
      and not a.is_read_only
      and perm.code = 'administration.manage_users'
  ) then
    raise exception 'Not permitted to manage user access' using errcode = '42501';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'An email is required' using errcode = '22023';
  end if;
  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'A display name is required' using errcode = '22023';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', p_actor_id)::text, true);

  insert into public.user_profiles (id, email, display_name, job_title)
  values (p_user_id, btrim(p_email), btrim(p_display_name), nullif(btrim(coalesce(p_job_title, '')), ''));
end;
$$;

comment on function app.create_user_profile is
  'Creates the user_profiles row for an auth.users login the Edge Function just created. Re-checks p_actor_id against administration.manage_users independently of the Edge Function''s own check, and attributes the audit trail to that actor via the request.jwt.claims GUC. Reachable only by service_role — see public.create_user_profile''s grants.';

create or replace function public.create_user_profile(
  p_user_id uuid, p_email text, p_display_name text, p_job_title text, p_actor_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.create_user_profile(p_user_id, p_email, p_display_name, p_job_title, p_actor_id);
$$;

comment on function public.create_user_profile is
  'Thin PostgREST-visible wrapper over app.create_user_profile. Granted to service_role ONLY — see this migration''s header. Never grant this to authenticated or anon.';

revoke all on function public.create_user_profile(uuid, text, text, text, uuid) from public;
revoke execute on function public.create_user_profile(uuid, text, text, text, uuid) from authenticated, anon;
grant execute on function public.create_user_profile(uuid, text, text, text, uuid) to service_role;

-- The Edge Function also needs `public.has_permission`, which never existed — every prior caller of
-- `app.has_permission` was itself another SECURITY DEFINER function, never a client. Safe to expose
-- broadly: it only ever checks the CALLER's own permissions (no user_id parameter to probe anyone
-- else's), so there is nothing to withhold from any authenticated user checking their own access.
create or replace function public.has_permission(perm_code text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select app.has_permission(perm_code);
$$;

comment on function public.has_permission is
  'Thin PostgREST-visible wrapper over app.has_permission. Always checks the caller''s own permissions via auth.uid() — safe for any authenticated caller.';

grant execute on function public.has_permission(text) to authenticated;
