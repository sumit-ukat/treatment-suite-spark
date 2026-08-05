-- 0025 · Fix client identity leak — clients_read RLS ignored clients.view_identity
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05). Found and fixed during a self-directed review of
-- the permission model, not reported by the user — see CHANGELOG for the full account.
--
-- Real, currently-live finding: the `clients_read` policy (migration 0006) granted SELECT on `clients`
-- to any role with access to a centre where the client has an admission. It never checked
-- `clients.view_identity`, even though that permission code has existed since migration 0014 and is
-- deliberately withheld from roles such as helpdesk — the whole point of the indicator/detail split
-- already proven for safeguarding, risk and medical records (migration 0020). Verified live: a
-- fictional helpdesk-role session (correctly lacking `clients.view_identity`) could `select * from
-- clients` and read a client's real first and last name.
--
-- This also means the previously-reported "verified" room board and admission form were built on a
-- direct `clients` read (`services/data-access.ts`'s `roomBoard.forCentre`) that happened to work only
-- because the leak let it. Tightening the policy without fixing that call site would have swapped one
-- bug (identity leak) for another (occupied beds silently rendering as empty for any role lacking
-- `clients.view_identity`). Both are fixed together: this migration tightens the policy and adds the
-- indicator function; the frontend change fixing the call site ships in the same commit.
--
-- Two behaviours are now correct where before there was one policy trying to do both jobs:
--   - Full identity (name) requires `clients.view_identity`.
--   - Knowing a client exists at all — reference only, no name — requires `clients.view_operational`,
--     via `app.client_summary`, following the same SECURITY DEFINER indicator pattern as
--     `app.safeguarding_indicator` / `app.risk_indicator`, returning null rather than raising, so a
--     caller can never tell from an error whether a row exists.
create or replace function app.client_summary(p_client_ids uuid[])
returns table (client_id uuid, reference text, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_has_identity boolean := app.has_permission('clients.view_identity');
begin
  if not app.can_read('clients.view_operational') and not v_has_identity then
    return;
  end if;

  return query
    select
      c.id,
      c.reference,
      case when v_has_identity
        then trim(coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name)
        else null
      end
    from public.clients c
    where c.id = any(p_client_ids)
      and exists (
        select 1 from public.admissions a
        where a.client_id = c.id
          and app.can_access_centre(a.centre_id)
      );
end;
$$;

comment on function app.client_summary is
  'Indicator-pattern read for client identity: reveals reference to any caller holding clients.view_operational, and the display name only to callers additionally holding clients.view_identity. Mirrors app.safeguarding_indicator / app.risk_indicator.';

-- Thin PostgREST-visible wrapper — see migration 0024 for why this pattern exists. All logic lives in
-- the app-schema function above; this adds nothing but reachability.
create or replace function public.client_summary(p_client_ids uuid[])
returns table (client_id uuid, reference text, display_name text)
language sql
security invoker
set search_path = ''
as $$
  select * from app.client_summary(p_client_ids);
$$;

comment on function public.client_summary is
  'Thin PostgREST-visible wrapper over app.client_summary. All checks and logic live in the app schema.';

grant execute on function app.client_summary(uuid[]) to authenticated;
grant execute on function public.client_summary(uuid[]) to authenticated;

drop policy if exists clients_read on clients;
create policy clients_read on clients for select to authenticated
  using (
    app.has_permission('clients.view_identity')
    and exists (
      select 1 from admissions a
      where a.client_id = clients.id
        and app.can_access_centre(a.centre_id)
    )
  );
