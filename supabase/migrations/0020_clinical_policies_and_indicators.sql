-- 0020 · Clinical policies, indicator accessors, family-meeting creation
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-05). 19 assertions passing.
--
-- The rule the whole product turns on: a helpdesk user must be able to know a safeguarding concern
-- EXISTS while being unable to read a single word of it. RLS gates rows but not columns, so:
--
--   * the tables require the *_detail permission — no row, therefore no narrative
--   * SECURITY DEFINER counters return numbers only, gated on the *_indicator permission
--
-- A counter cannot leak a narrative because it never selects one. That is the point: the guarantee
-- comes from the shape of the query, not from remembering to omit a column.

-- --- family contact and meetings: treatment coordination, level 2 ------------
create policy family_contacts_read on family_contacts for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('family.view'));
create policy family_contacts_insert on family_contacts for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('family.log_contact'));
create policy family_contacts_update on family_contacts for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('family.log_contact'))
  with check (app.can_access_centre(centre_id));

create policy family_meetings_read on family_meetings for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('family.view'));
create policy family_meetings_insert on family_meetings for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('family.schedule_meeting'));
create policy family_meetings_update on family_meetings for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('family.schedule_meeting'))
  with check (app.can_access_centre(centre_id));

-- --- detox, medical, safeguarding, risk: the row IS the detail ---------------
create policy detox_read on detox_records for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('medical.view_detail'));
create policy detox_insert on detox_records for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('medical.record'));
create policy detox_update on detox_records for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('medical.record'))
  with check (app.can_access_centre(centre_id));

create policy medical_reviews_read on medical_review_requests for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('medical.view_detail'));
-- Requesting a review needs only summary rights: asking for one is an operational act, reading the
-- outcome is not.
create policy medical_reviews_insert on medical_review_requests for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.can_read('medical.view_summary'));
create policy medical_reviews_update on medical_review_requests for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('medical.record'))
  with check (app.can_access_centre(centre_id));

create policy safeguarding_read on safeguarding_records for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('safeguarding.view_detail'));
create policy safeguarding_insert on safeguarding_records for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('safeguarding.record'));
create policy safeguarding_update on safeguarding_records for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('safeguarding.record'))
  with check (app.can_access_centre(centre_id));

create policy risk_read on risk_records for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('risk.view_detail'));
create policy risk_insert on risk_records for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('risk.record'));
create policy risk_update on risk_records for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('risk.record'))
  with check (app.can_access_centre(centre_id));

-- ---------------------------------------------------------------------------
-- Indicators. Counts and severities only.
--
-- Returns zero rather than raising when the user holds neither permission: an error would leak the
-- existence of a concern through the failure itself.
-- ---------------------------------------------------------------------------
create or replace function app.safeguarding_indicator(p_admission_id uuid)
returns table (active_count integer, highest_severity text)
language plpgsql stable security definer set search_path = ''
as $$
declare v_centre uuid;
begin
  select a.centre_id into v_centre from public.admissions a where a.id = p_admission_id;
  if v_centre is null or not app.can_access_centre(v_centre)
     or not app.can_read('safeguarding.view_indicator') then
    return query select 0, null::text;
    return;
  end if;

  return query
    select count(*)::integer,
           (array_agg(s.severity order by
              case s.severity when 'critical' then 4 when 'high' then 3
                              when 'medium' then 2 else 1 end desc))[1]
    from public.safeguarding_records s
    where s.admission_id = p_admission_id and s.is_active;
end;
$$;

create or replace function app.risk_indicator(p_admission_id uuid)
returns table (active_count integer, highest_severity text)
language plpgsql stable security definer set search_path = ''
as $$
declare v_centre uuid;
begin
  select a.centre_id into v_centre from public.admissions a where a.id = p_admission_id;
  if v_centre is null or not app.can_access_centre(v_centre)
     or not app.can_read('risk.view_indicator') then
    return query select 0, null::text;
    return;
  end if;

  return query
    select count(*)::integer,
           (array_agg(r.severity order by
              case r.severity when 'critical' then 4 when 'high' then 3
                              when 'medium' then 2 else 1 end desc))[1]
    from public.risk_records r
    where r.admission_id = p_admission_id and r.is_active;
end;
$$;

-- Status and dates for summary holders. The outcome text is simply never selected — that is the
-- whole mechanism, and it is why this is a function rather than a column-filtered view.
create or replace function app.medical_review_summary(p_admission_id uuid)
returns table (id uuid, status text, priority text, intended_review_date date, requested_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_centre uuid;
begin
  select a.centre_id into v_centre from public.admissions a where a.id = p_admission_id;
  if v_centre is null or not app.can_access_centre(v_centre)
     or not app.can_read('medical.view_summary') then
    return;
  end if;

  return query
    select m.id, m.status, m.priority, m.intended_review_date, m.requested_at
    from public.medical_review_requests m
    where m.admission_id = p_admission_id
    order by m.requested_at desc;
end;
$$;

grant execute on function app.safeguarding_indicator(uuid), app.risk_indicator(uuid),
                          app.medical_review_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Creating a family meeting stamps eligibility from the centre's configured window.
--
-- The caller does not supply eligible_from. Letting a client pass it would make the CHECK
-- constraint decorative: you would simply send an earlier eligibility date alongside an earlier
-- meeting date and the constraint would be satisfied.
-- ---------------------------------------------------------------------------
create or replace function app.create_family_meeting(
  p_admission_id uuid,
  p_kind text default 'meeting',
  p_scheduled_for timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_adm   public.admissions%rowtype;
  v_hours integer;
  v_from  timestamptz;
  v_id    uuid;
begin
  select * into v_adm from public.admissions where id = p_admission_id;
  if not found then raise exception 'Admission % not found', p_admission_id; end if;

  if not app.can_access_centre(v_adm.centre_id)
     or not app.has_permission('family.schedule_meeting') then
    raise exception 'Not permitted to schedule a family meeting for this admission'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce((c.settings ->> 'familyMeetingEligibilityHours')::int, 168)
    into v_hours from public.centres c where c.id = v_adm.centre_id;

  -- Elapsed hours from admission, so the window is unaffected by the clocks changing.
  v_from := v_adm.admitted_at + make_interval(hours => v_hours);

  insert into public.family_meetings
    (admission_id, centre_id, meeting_kind, eligible_from, scheduled_for, status, created_by)
  values
    (p_admission_id, v_adm.centre_id, p_kind, v_from, p_scheduled_for,
     case when p_scheduled_for is null then 'requested' else 'scheduled' end, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function app.create_family_meeting(uuid, text, timestamptz) to authenticated;

comment on function app.create_family_meeting(uuid, text, timestamptz) is
  'Stamps eligible_from from centre settings. Callers cannot supply it, or the CHECK would be decorative.';
