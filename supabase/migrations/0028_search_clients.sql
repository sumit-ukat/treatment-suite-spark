-- 0028 · app.search_clients — the client directory's search, and closing the admission-form gap it named
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-06).
--
-- The gap: there was no way to find a client except already having their bed open on the room board.
-- `AdmitClientForm.tsx`'s own header comment named this explicitly: it is scoped to creating a new
-- client only, "because... that needs a client directory to search, and the Clients screen does not
-- exist yet." `app.admit_client` (migration 0022) has supported reusing an existing client via
-- `p_client_id` since it was written — the frontend gap was the only thing missing. This migration
-- adds the one thing needed to close both gaps at once: a search function.
--
-- Why a new function rather than widening `app.client_summary` (migration 0025): that function takes
-- an array of client ids the caller already has — it has no text-matching parameter, and text
-- matching against names is exactly the kind of query that needs permission-aware server-side logic
-- (see below), not something to bolt onto a by-id lookup.
--
-- Scoped to ONE centre, not the organisation: "every centre operates on its own... there is no data
-- sharing between those" is a standing decision for this product, and a client only appears in a
-- centre's directory if they have at least one admission — any status, so a discharged client can be
-- found and is not lost — AT that centre. This does mean the same real person admitted at two
-- different UKAT centres over time appears as two independent, unconnected search results, one per
-- centre; that is the same "no data sharing" boundary already applied everywhere else in this system,
-- not a gap specific to search.
--
-- The identity split mirrors `client_summary` exactly, for the same reason: `clients.view_operational`
-- sees a reference and can search BY reference; `clients.view_identity` additionally sees the name and
-- can search BY name. A caller lacking view_identity is not given a "does this name exist" side
-- channel by name-matching for them and simply returning no name back — the match itself is withheld,
-- not just the display.
--
-- `has_open_admission` reports a client-wide state (the `admissions_one_open_per_client` partial unique
-- index from migration 0004 is global, not per-centre — a client can have at most one open admission
-- system-wide), so the picker can show "already admitted" without a second round trip; `admit_client`'s
-- own check is still what actually enforces it.
--
-- No trigram index yet. At the current and foreseeable scale (tens of clients per centre) a plain
-- ILIKE over an indexed-by-equality column is fast enough; a `pg_trgm` GIN index is the obvious next
-- step if a centre's client count grows enough for this to matter, added when it does.
create or replace function app.search_clients(p_centre_id uuid, p_query text)
returns table (
  client_id uuid,
  reference text,
  display_name text,
  has_open_admission boolean,
  last_admission_status text,
  last_admitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_has_identity boolean := app.has_permission('clients.view_identity');
  v_query text := btrim(coalesce(p_query, ''));
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  if not app.can_read('clients.view_operational') and not v_has_identity then
    return;
  end if;

  -- Two characters minimum: below that, ILIKE '%_%' over every client at the centre is a full scan
  -- for a result set too broad to be useful, on every keystroke.
  if length(v_query) < 2 then
    return;
  end if;

  return query
    select
      c.id,
      c.reference,
      case when v_has_identity
        then trim(coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name)
        else null
      end,
      exists (
        select 1 from public.admissions op
        where op.client_id = c.id and op.status in ('planned', 'active')
      ),
      last_adm.status,
      last_adm.admitted_at
    from public.clients c
    join lateral (
      select a.status, a.admitted_at
      from public.admissions a
      where a.client_id = c.id and a.centre_id = p_centre_id
      order by a.admitted_at desc
      limit 1
    ) last_adm on true
    where
      c.reference ilike ('%' || v_query || '%')
      or (
        v_has_identity
        and (
          c.first_name ilike ('%' || v_query || '%')
          or c.last_name ilike ('%' || v_query || '%')
          or c.preferred_name ilike ('%' || v_query || '%')
        )
      )
    order by last_adm.admitted_at desc
    limit 25;
end;
$$;

comment on function app.search_clients is
  'Search for a client, scoped to one centre. Reference matching needs clients.view_operational; name matching and the returned display_name additionally need clients.view_identity, mirroring app.client_summary.';

create or replace function public.search_clients(p_centre_id uuid, p_query text)
returns table (
  client_id uuid,
  reference text,
  display_name text,
  has_open_admission boolean,
  last_admission_status text,
  last_admitted_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from app.search_clients(p_centre_id, p_query);
$$;

comment on function public.search_clients is
  'Thin PostgREST-visible wrapper over app.search_clients. All checks and logic live in the app schema.';

grant execute on function app.search_clients(uuid, text) to authenticated;
grant execute on function public.search_clients(uuid, text) to authenticated;
