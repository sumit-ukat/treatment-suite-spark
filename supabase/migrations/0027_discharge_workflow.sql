-- 0027 · The discharge workflow
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-06).
--
-- The gap this closes: admission and daily task tracking both work now, but nothing could ever end a
-- stay. A bed, once filled, stayed filled forever — occupancy could only ever go up, which makes every
-- downstream number (available beds, the group hub's occupancy percentage) permanently wrong the
-- moment a single real discharge happens.
--
-- Three permission codes have existed since migration 0014 with no function behind any of them:
-- discharge.initiate ("Initiate an early discharge"), discharge.approve ("Approve an early
-- discharge"), discharge.finalise ("Finalise a discharge" — no "early" in that one). Read literally,
-- that is two different paths, not three steps of one:
--   * A routine discharge on the planned date needs only discharge.finalise. There is nothing to
--     approve about a stay ending when it was always going to end.
--   * Ending a stay early, by transfer, or for another non-routine reason needs sign-off first:
--     discharge.initiate proposes it, discharge.approve — held by a DIFFERENT person, enforced below,
--     since a self-approved override is not an override — signs off, and only then can
--     discharge.finalise execute it.
-- This reading is inferred from the permission descriptions and the seeded role grants (centre_manager
-- holds initiate + finalise but not approve; supervisor holds only approve; only platform_admin holds
-- all three) — nothing in the brief specifies the workflow explicitly, so it is stated here plainly
-- rather than assumed silently. 'transfer' and 'other' are treated the same as 'early' — anything that
-- is not the routine planned case — since the seeded permissions give no reason to treat them
-- differently, but this is the same kind of inference and should be confirmed against how UKAT
-- actually wants transfers handled.
--
-- One new table carries the approval state that a discharge_type other than 'planned' needs.
-- Following the pattern set by client_tasks (migration 0026): every write goes through a
-- SECURITY DEFINER function, and DML is revoked from authenticated/anon entirely, because a
-- column-level bypass here would be worse than the one just closed — this table's entire purpose is
-- proving a second, different person signed off.
create table discharge_requests (
  id                uuid primary key default gen_random_uuid(),
  admission_id      uuid not null,
  centre_id         uuid not null,
  discharge_type    text not null,
  reason            text not null,
  status            text not null default 'pending',
  requested_at      timestamptz not null default now(),
  requested_by      uuid references auth.users(id),
  approved_at       timestamptz,
  approved_by       uuid references auth.users(id),
  approval_notes    text,
  rejected_at       timestamptz,
  rejected_by       uuid references auth.users(id),
  rejection_reason  text,
  finalised_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint discharge_requests_admission_centre_fkey
    foreign key (admission_id, centre_id) references admissions (id, centre_id),
  constraint discharge_requests_type_check
    check (discharge_type in ('early', 'transfer', 'other')),
  constraint discharge_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'finalised')),
  constraint discharge_requests_reason_not_blank
    check (length(btrim(reason)) > 0),
  constraint discharge_requests_approval_fields_consistent
    check (
      (status = 'approved' and approved_at is not null and approved_by is not null)
      or (status <> 'approved')
    ),
  constraint discharge_requests_rejection_fields_consistent
    check (
      (status = 'rejected' and rejected_at is not null and rejected_by is not null
        and rejection_reason is not null and length(btrim(rejection_reason)) > 0)
      or (status <> 'rejected')
    ),
  constraint discharge_requests_finalised_fields_consistent
    check (
      (status = 'finalised' and finalised_at is not null)
      or (status <> 'finalised')
    )
);

comment on table discharge_requests is
  'Approval state for a non-routine (early/transfer/other) discharge. A routine planned discharge needs no row here — see app.finalise_discharge.';

-- One pending request per admission at a time. Not "one request ever" — a rejected request must not
-- block a later attempt.
create unique index discharge_requests_one_pending_per_admission
  on discharge_requests (admission_id)
  where status = 'pending';

create index discharge_requests_admission_id_idx on discharge_requests (admission_id);

alter table discharge_requests enable row level security;
alter table discharge_requests force row level security;

-- Read-only for authenticated: every write happens through the functions below. Visible to anyone who
-- can act on any part of the workflow — deliberately OR across the three permissions rather than
-- narrowed per status, because a centre_manager (initiate + finalise, no approve) still needs to see a
-- pending request awaiting someone else's approval, not just ones already past that stage.
create policy discharge_requests_read on discharge_requests for select to authenticated
  using (
    app.can_access_centre(centre_id)
    and (
      app.can_read('discharge.initiate')
      or app.can_read('discharge.approve')
      or app.can_read('discharge.finalise')
    )
  );

revoke insert, update, delete on discharge_requests from authenticated, anon;

create trigger audit_discharge_requests
  after insert or update or delete on discharge_requests
  for each row execute function app.audit_row();

create trigger touch_discharge_requests
  before update on discharge_requests
  for each row execute function app.touch_updated_at();

-- Step 1 of the non-routine path. Proposes ending a stay early/by transfer/for another reason.
create or replace function app.request_early_discharge(
  p_admission_id uuid,
  p_discharge_type text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm    public.admissions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if not app.has_permission('discharge.initiate') then
    raise exception 'Not permitted to initiate a discharge' using errcode = '42501';
  end if;

  if p_discharge_type not in ('early', 'transfer', 'other') then
    raise exception 'Not a request-requiring discharge type: %', p_discharge_type using errcode = '22023';
  end if;

  if v_reason is null then
    raise exception 'A reason is required to request a discharge' using errcode = '22023';
  end if;

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be discharged' using errcode = '22023';
  end if;

  -- The partial unique index also enforces this; caught here first for a message that names the
  -- actual problem instead of a bare constraint-violation code.
  if exists (
    select 1 from public.discharge_requests
    where admission_id = p_admission_id and status = 'pending'
  ) then
    raise exception 'A discharge request is already pending for this admission' using errcode = '23505';
  end if;

  insert into public.discharge_requests (admission_id, centre_id, discharge_type, reason, requested_by)
  values (p_admission_id, v_adm.centre_id, p_discharge_type, v_reason, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.request_early_discharge is
  'Step 1 of the non-routine discharge path. Requires discharge.initiate. The routine planned path (app.finalise_discharge with discharge_type = ''planned'') does not use this.';

-- Step 2. A different person from the requester signs off — or refuses to.
create or replace function app.decide_discharge_request(
  p_request_id uuid,
  p_approve boolean,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req  public.discharge_requests;
  v_note text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not app.has_permission('discharge.approve') then
    raise exception 'Not permitted to approve or reject a discharge request' using errcode = '42501';
  end if;

  select * into v_req from public.discharge_requests where id = p_request_id;

  if v_req.id is null or not app.can_access_centre(v_req.centre_id) then
    raise exception 'Discharge request not found' using errcode = 'P0002';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'This request has already been %', v_req.status using errcode = '22023';
  end if;

  -- The entire point of a separate approve permission: the person who proposed ending the stay early
  -- cannot be the same person who signs off on it. Without this, initiate + approve held by the same
  -- role would collapse to no check at all.
  if v_req.requested_by = auth.uid() then
    raise exception 'The person who requested a discharge cannot approve or reject it' using errcode = '42501';
  end if;

  if not p_approve and v_note is null then
    raise exception 'A reason is required to reject a discharge request' using errcode = '22023';
  end if;

  update public.discharge_requests
     set status           = case when p_approve then 'approved' else 'rejected' end,
         approved_at      = case when p_approve then pg_catalog.now() else null end,
         approved_by      = case when p_approve then auth.uid() else null end,
         approval_notes   = case when p_approve then v_note else null end,
         rejected_at      = case when p_approve then null else pg_catalog.now() end,
         rejected_by      = case when p_approve then null else auth.uid() end,
         rejection_reason = case when p_approve then null else v_note end
   where id = p_request_id;
end;
$$;

comment on function app.decide_discharge_request is
  'Step 2 of the non-routine discharge path. Requires discharge.approve and a different person from the requester.';

-- Step 3 for the non-routine path, and the only step for a routine one. Ends the stay for real: closes
-- the room allocation and marks the admission discharged, in one transaction.
create or replace function app.finalise_discharge(
  p_admission_id uuid,
  p_discharge_type text,
  p_actual_discharge_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm    public.admissions;
  v_req    public.discharge_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_at     timestamptz := coalesce(p_actual_discharge_at, pg_catalog.now());
begin
  if not app.has_permission('discharge.finalise') then
    raise exception 'Not permitted to finalise a discharge' using errcode = '42501';
  end if;

  if p_discharge_type not in ('planned', 'early', 'transfer', 'other') then
    raise exception 'Not a valid discharge type: %', p_discharge_type using errcode = '22023';
  end if;

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be discharged' using errcode = '22023';
  end if;

  if v_at < v_adm.admitted_at then
    raise exception 'A discharge cannot be recorded before the admission it discharges' using errcode = '22023';
  end if;

  -- Not in the future: the room board treats an ended allocation as freed immediately. A future
  -- timestamp here would free the bed for a client who has not left yet.
  if v_at > pg_catalog.now() + interval '1 hour' then
    raise exception 'A discharge cannot be recorded in the future' using errcode = '22023';
  end if;

  if p_discharge_type <> 'planned' then
    select * into v_req from public.discharge_requests
     where admission_id = p_admission_id
       and discharge_type = p_discharge_type
       and status = 'approved'
     order by approved_at desc
     limit 1;

    if v_req.id is null then
      raise exception
        'An approved % discharge request is required before finalising this discharge', p_discharge_type
        using errcode = '22023';
    end if;

    update public.discharge_requests
       set status = 'finalised', finalised_at = pg_catalog.now()
     where id = v_req.id;
  end if;

  -- Recorded once, read by app.audit_row for both writes below via the transaction-local GUC.
  if v_reason is not null then
    perform set_config('app.change_reason', v_reason, true);
  end if;

  update public.room_allocations
     set ended_at = v_at, ended_by = auth.uid()
   where admission_id = p_admission_id and ended_at is null;

  update public.admissions
     set status = 'discharged',
         actual_discharge_at = v_at,
         discharge_type = p_discharge_type,
         updated_by = auth.uid()
   where id = p_admission_id;
end;
$$;

comment on function app.finalise_discharge is
  'Ends a stay: closes the open room allocation and marks the admission discharged. Requires discharge.finalise. For any discharge_type other than ''planned'', requires a matching approved app.discharge_requests row, consumed on use.';

create or replace function public.request_early_discharge(
  p_admission_id uuid, p_discharge_type text, p_reason text
)
returns uuid
language sql security invoker set search_path = ''
as $$ select app.request_early_discharge(p_admission_id, p_discharge_type, p_reason); $$;

create or replace function public.decide_discharge_request(
  p_request_id uuid, p_approve boolean, p_notes text
)
returns void
language sql security invoker set search_path = ''
as $$ select app.decide_discharge_request(p_request_id, p_approve, p_notes); $$;

create or replace function public.finalise_discharge(
  p_admission_id uuid, p_discharge_type text, p_actual_discharge_at timestamptz, p_reason text
)
returns void
language sql security invoker set search_path = ''
as $$ select app.finalise_discharge(p_admission_id, p_discharge_type, p_actual_discharge_at, p_reason); $$;

grant execute on function app.request_early_discharge(uuid, text, text) to authenticated;
grant execute on function app.decide_discharge_request(uuid, boolean, text) to authenticated;
grant execute on function app.finalise_discharge(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.request_early_discharge(uuid, text, text) to authenticated;
grant execute on function public.decide_discharge_request(uuid, boolean, text) to authenticated;
grant execute on function public.finalise_discharge(uuid, text, timestamptz, text) to authenticated;
