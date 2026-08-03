-- 0001 · Extensions and shared schema
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-03).
--
-- btree_gist is required by the later exclusion constraint that actually prevents two clients
-- occupying one bed. Without it that constraint cannot be created.
-- (0003 moves it out of `public` — see the note there.)

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- EXCLUDE USING gist (uuid WITH =, tstzrange WITH &&)

-- Internal schema for security helpers. Kept out of `public` so it is not exposed through PostgREST.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- Shared updated_at trigger. Hardened in 0003 (search_path).
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on schema app is
  'Internal helpers (access resolution, triggers). Not exposed via the REST API.';
