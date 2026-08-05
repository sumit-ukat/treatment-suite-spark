-- 0024 · public.admit_client — the PostgREST-visible wrapper
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05). Found and fixed during browser verification of
-- the admission form — see CHANGELOG for the full account.
--
-- Real finding, not hypothetical: the first call to `app.admit_client` through the actual Supabase
-- client failed with "Could not find the function public.admit_client(...) in the schema cache".
-- PostgREST only resolves RPC calls against schemas in its exposed-schema list, which is `public`
-- (plus graphql_public) by default. Every trusted function in this project lives in `app`, and until
-- this point every one of them had only ever been exercised via direct SQL through a connection with
-- full database access — which bypasses PostgREST entirely. This was the first call made through the
-- real client-facing path, and the gap was invisible until that path was actually used.
--
-- Two ways to close it: expose the whole `app` schema to PostgREST, or add a thin `public` wrapper
-- per function that a screen actually calls. The wrapper is the better boundary — `app` stays
-- completely unreachable from the API even in principle, and the public surface is exactly the set
-- of things deliberately exposed, not everything in the trusted schema. The wrapper adds no logic:
-- every check already lives inside `app.admit_client`.
--
-- This pattern repeats for any other app.* function a future screen calls directly (family meeting
-- creation, the safeguarding/risk indicators) — added when that screen is built, not speculatively.
create or replace function public.admit_client(
  p_centre_id           uuid,
  p_bed_id              uuid,
  p_admitted_at         timestamptz,
  p_planned_duration    integer,
  p_planned_duration_unit text,
  p_client_id           uuid default null,
  p_first_name          text default null,
  p_last_name           text default null,
  p_preferred_name      text default null,
  p_treatment_group     text default null,
  p_substance_name      text default null,
  p_peep_required       boolean default false,
  p_focal_therapist_label text default null,
  p_buddy_label         text default null,
  p_doctor_label        text default null,
  p_reason              text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.admit_client(
    p_centre_id, p_bed_id, p_admitted_at, p_planned_duration, p_planned_duration_unit,
    p_client_id, p_first_name, p_last_name, p_preferred_name, p_treatment_group,
    p_substance_name, p_peep_required, p_focal_therapist_label, p_buddy_label, p_doctor_label,
    p_reason
  );
$$;

grant execute on function public.admit_client(
  uuid, uuid, timestamptz, integer, text, uuid, text, text, text, text, text, boolean, text, text, text, text
) to authenticated;

comment on function public.admit_client is
  'Thin PostgREST-visible wrapper over app.admit_client. All checks and logic live in the app schema.';
