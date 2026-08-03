-- 0003 · Harden the shared trigger function and relocate btree_gist
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03).
--
-- Both fixes come from Supabase's database linter, run immediately after 0002. Neither was
-- exploitable here yet — there is no client data and no policy — but both get harder to change
-- later, and a WARN that lives in the baseline stops being read as a warning.

-- 1. Move btree_gist out of `public`.
--    Objects in `public` sit on the schema PostgREST exposes. Extensions have no business there.
drop extension if exists btree_gist;
create extension if not exists btree_gist with schema extensions;

-- 2. Pin the trigger function's search_path.
--
--    Without `set search_path`, schema resolution inside the function follows whatever the CALLER
--    has configured. A user able to set their own search_path could shadow a referenced object and
--    have their version execute in this function's context. Setting it empty forces every
--    reference to be schema-qualified, which is why now() becomes pg_catalog.now().
--
--    `security invoker` is explicit rather than implied: this function must run as the caller, so
--    it can never become a privilege-escalation route.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function app.touch_updated_at() is
  'Sets updated_at on UPDATE. search_path pinned empty; all references schema-qualified.';
