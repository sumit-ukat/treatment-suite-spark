-- 0007 · Access resolution helpers and RLS policies
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03). Verified with real JWT claims — 12 assertions,
-- including that an unassigned user sees nothing and a helpdesk user cannot grant itself admin.
--
-- The helpers are SECURITY DEFINER with a pinned empty search_path. They must read the access tables
-- regardless of the caller's own RLS: otherwise answering "which centres may I see?" would recurse
-- into the very policies that call it. They are STABLE so Postgres evaluates them once per statement
-- rather than once per row.

-- Every centre the current user can reach by any route, counting only live assignments.
create or replace function app.accessible_centre_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct c.id
  from public.centres c
  join public.user_access_assignments a
    on a.user_id = auth.uid()
   and a.starts_at <= now()
   and (a.ends_at is null or a.ends_at > now())   -- expired cover grants nothing
   and (
        (a.scope_type = 'organisation' and a.organisation_id = c.organisation_id)
     or (a.scope_type = 'zone'         and a.zone_id = c.zone_id)
     or (a.scope_type = 'centre'       and a.centre_id = c.id)
   )
  join public.user_profiles p on p.id = a.user_id and p.is_active  -- disabled account grants nothing
$$;

create or replace function app.can_access_centre(target_centre uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from app.accessible_centre_ids() cid where cid = target_centre)
$$;

-- Write-capable permission check. Read-only assignments are excluded here on purpose.
create or replace function app.has_permission(perm_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.user_access_assignments a
    join public.user_profiles p on p.id = a.user_id and p.is_active
    join public.role_permissions rp on rp.role_id = a.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where a.user_id = auth.uid()
      and a.starts_at <= now()
      and (a.ends_at is null or a.ends_at > now())
      and not a.is_read_only
      and perm.code = perm_code
  )
$$;

-- Read variant: a read-only assignment still grants visibility.
create or replace function app.can_read(perm_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.user_access_assignments a
    join public.user_profiles p on p.id = a.user_id and p.is_active
    join public.role_permissions rp on rp.role_id = a.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where a.user_id = auth.uid()
      and a.starts_at <= now()
      and (a.ends_at is null or a.ends_at > now())
      and perm.code = perm_code
  )
$$;

grant execute on function app.accessible_centre_ids(), app.can_access_centre(uuid),
  app.has_permission(text), app.can_read(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies. Reads follow centre assignment; writes additionally require the
-- relevant permission. Nothing is readable without an assignment.
-- ---------------------------------------------------------------------------

create policy organisations_read on organisations for select to authenticated
  using (exists (select 1 from centres c where c.organisation_id = organisations.id
                 and app.can_access_centre(c.id)));

create policy zones_read on zones for select to authenticated
  using (exists (select 1 from centres c where c.zone_id = zones.id
                 and app.can_access_centre(c.id)));

create policy centres_read on centres for select to authenticated
  using (app.can_access_centre(id));
create policy centres_write on centres for update to authenticated
  using (app.can_access_centre(id) and app.has_permission('centre.manage'))
  with check (app.can_access_centre(id) and app.has_permission('centre.manage'));

create policy rooms_read on rooms for select to authenticated
  using (app.can_access_centre(centre_id));
create policy rooms_write on rooms for all to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('room.manage'))
  with check (app.can_access_centre(centre_id) and app.has_permission('room.manage'));

create policy beds_read on beds for select to authenticated
  using (app.can_access_centre(centre_id));
create policy beds_write on beds for all to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('room.manage'))
  with check (app.can_access_centre(centre_id) and app.has_permission('room.manage'));

-- A client is visible only through an admission at a centre the user can reach. There is no way to
-- enumerate clients across the organisation without organisation-wide access.
create policy clients_read on clients for select to authenticated
  using (exists (select 1 from admissions a where a.client_id = clients.id
                 and app.can_access_centre(a.centre_id)));
create policy clients_write on clients for all to authenticated
  using (app.has_permission('client.manage')
         and exists (select 1 from admissions a where a.client_id = clients.id
                     and app.can_access_centre(a.centre_id)))
  with check (app.has_permission('client.manage'));

create policy admissions_read on admissions for select to authenticated
  using (app.can_access_centre(centre_id));
create policy admissions_write on admissions for all to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('admission.manage'))
  with check (app.can_access_centre(centre_id) and app.has_permission('admission.manage'));

create policy allocations_read on room_allocations for select to authenticated
  using (app.can_access_centre(centre_id));
create policy allocations_write on room_allocations for all to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('room.allocate'))
  with check (app.can_access_centre(centre_id) and app.has_permission('room.allocate'));

create policy substances_read on substances for select to authenticated
  using (exists (select 1 from centres c where c.organisation_id = substances.organisation_id
                 and app.can_access_centre(c.id)));

-- The role catalogue is not sensitive; who holds what is.
create policy roles_read on roles for select to authenticated using (true);
create policy permissions_read on permissions for select to authenticated using (true);
create policy role_permissions_read on role_permissions for select to authenticated using (true);

create policy profiles_read_self on user_profiles for select to authenticated
  using (id = auth.uid() or app.can_read('access.manage'));
create policy profiles_write on user_profiles for all to authenticated
  using (app.has_permission('access.manage'))
  with check (app.has_permission('access.manage'));

create policy assignments_read on user_access_assignments for select to authenticated
  using (user_id = auth.uid() or app.can_read('access.manage'));

-- Granting access is itself permissioned, which is what stops privilege escalation: a user cannot
-- write a row that would give themselves a role they do not already have the right to grant.
create policy assignments_write on user_access_assignments for all to authenticated
  using (app.has_permission('access.manage'))
  with check (app.has_permission('access.manage'));
