-- 0032 · app.search_clients — allow an empty query to list everyone at the centre
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-10).
--
-- Until now an empty or single-character query returned nothing (migration 0028's "two characters
-- minimum" rule), so the Clients directory only ever showed anyone after the caller typed something.
-- The product decision has changed: the directory should default to listing everyone who has stayed
-- at the centre, with search narrowing that list rather than being required to see it at all. At the
-- scale this runs at (tens of clients per centre) listing everyone is not the "full scan on every
-- keystroke" cost migration 0028 was guarding against — that cost is specific to re-querying on each
-- character typed, not to a single, deliberate "show me everyone" request.
--
-- A lone single-character query still returns nothing: ILIKE '%x%' over every client is exactly the
-- too-broad-to-be-useful match 0028 described, and that reasoning still holds for a real (if short)
-- search term. Only a fully empty, trimmed query is treated as "list everyone" — an explicit, distinct
-- case, not the low end of a shrinking threshold.
--
-- The result cap goes from 25 to 200 alongside this: 25 was sized for a narrowed search result, not for
-- a centre's whole roster, and a "list everyone" call that silently truncates a growing centre's history
-- would misreport its size (see the directory's own "N people have stayed at this centre" count).
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

  -- A single character is still too broad an ILIKE to be a useful search; only a fully empty query
  -- is the deliberate "list everyone" case.
  if length(v_query) = 1 then
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
      v_query = ''
      or c.reference ilike ('%' || v_query || '%')
      or (
        v_has_identity
        and (
          c.first_name ilike ('%' || v_query || '%')
          or c.last_name ilike ('%' || v_query || '%')
          or c.preferred_name ilike ('%' || v_query || '%')
        )
      )
    order by last_adm.admitted_at desc
    limit 200;
end;
$$;

comment on function app.search_clients is
  'Search for a client, scoped to one centre — an empty query lists everyone at the centre. Reference matching needs clients.view_operational; name matching and the returned display_name additionally need clients.view_identity, mirroring app.client_summary.';
