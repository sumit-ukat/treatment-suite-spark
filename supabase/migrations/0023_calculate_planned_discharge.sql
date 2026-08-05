-- 0023 · app.calculate_planned_discharge — the SQL twin of the TypeScript discharge calculation
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05). 14 assertions passing, run against
-- app.admit_client end to end — see the CHANGELOG entry for the full list.
--
-- Same duplication rationale as app.compute_due_at (0012): the browser needs this to preview, the
-- database needs it because business rules must be enforced somewhere a client cannot bypass. Both
-- must compute the same date for the same inputs.
--
-- Inclusive-of-admission-day is the rule inferred from six of the eight workbook rows (see
-- WORKBOOK_REVIEW.md; OPEN_QUESTIONS Q3/Q10 — still unconfirmed). Configurable per centre via
-- `settings.dischargeInclusiveOfAdmissionDay`, defaulting true, so an answer changes a value rather
-- than a code path.
create or replace function app.calculate_planned_discharge(
  p_admitted_at timestamptz,
  p_duration    integer,
  p_unit        text,
  p_centre_id   uuid
)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz        text;
  v_inclusive boolean;
  v_days      integer;
  v_offset    integer;
begin
  if p_duration <= 0 then
    raise exception 'Treatment duration must be a positive whole number, received %', p_duration;
  end if;

  select c.timezone, coalesce((c.settings ->> 'dischargeInclusiveOfAdmissionDay')::boolean, true)
    into v_tz, v_inclusive
    from public.centres c where c.id = p_centre_id;

  if v_tz is null then
    raise exception 'Centre % not found', p_centre_id;
  end if;

  v_days   := case when p_unit = 'weeks' then p_duration * 7 else p_duration end;
  v_offset := case when v_inclusive then v_days - 1 else v_days end;

  -- The admission's calendar date in the centre's zone, plus the offset. A pure date computation:
  -- no DST ambiguity, because a `date` has no time component to preserve across the clocks changing.
  return ((p_admitted_at at time zone v_tz)::date) + v_offset;
end;
$$;

grant execute on function app.calculate_planned_discharge(timestamptz, integer, text, uuid) to authenticated;

comment on function app.calculate_planned_discharge is
  'SQL twin of calculatePlannedDischargeDate in src/domain/discharge.ts. Must be kept in sync.';
