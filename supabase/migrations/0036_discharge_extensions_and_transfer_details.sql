-- 0036 · Stay extensions and transfer detail fields
--
-- Two gaps closed together because both touch the discharge domain:
--
-- 1. STAY EXTENSIONS. There was no way to extend a client's planned stay without editing the
--    admission row directly. Extensions need the same two-person sign-off discipline as early
--    discharges — someone proposes it, a different person approves — and the audit trail should
--    show every extension separately, not just the current planned discharge date. A new
--    `admission_extensions` table carries that history; on approval the function updates
--    `admissions.current_planned_discharge_date` in the same transaction.
--
-- 2. TRANSFER DETAIL. `discharge_requests` already accepted discharge_type = 'transfer', but
--    only with a free-text reason — no destination, no treatment type, no duration. Three
--    nullable columns fill that gap. They are null for 'early' and 'other' rows; the new
--    `app.request_transfer_discharge` function sets all three when creating a transfer request.
--    The existing `app.request_early_discharge` is unchanged.
--
-- Two new permission codes mirror the discharge pair:
--   extension.initiate — granted to centre_manager (matches discharge.initiate)
--   extension.approve  — granted to supervisor (matches discharge.approve)
-- platform_admin gains both by its cross-join construction.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into permissions (code, description, sensitivity_level) values
  ('extension.initiate', 'Request a stay extension',  1),
  ('extension.approve',  'Approve a stay extension',  1)
on conflict (code) do nothing;

-- platform_admin already gets everything by construction — only the named roles need rows.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code in ('extension.initiate', 'extension.approve')
 where r.code = 'platform_admin'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code = 'extension.initiate'
 where r.code = 'centre_manager'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code = 'extension.approve'
 where r.code = 'supervisor'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Transfer detail columns (nullable — only set for discharge_type = 'transfer')
-- ---------------------------------------------------------------------------

alter table discharge_requests
  add column if not exists transfer_destination     text,
  add column if not exists transfer_treatment_type  text,
  add column if not exists transfer_duration_days   integer;

-- ---------------------------------------------------------------------------
-- Stay extension table
-- ---------------------------------------------------------------------------

create table admission_extensions (
  id                      uuid        primary key default gen_random_uuid(),
  admission_id            uuid        not null,
  centre_id               uuid        not null,
  original_discharge_date date        not null,
  additional_days         integer     not null,
  new_discharge_date      date        not null,
  reason                  text        not null,
  status                  text        not null default 'pending',
  requested_at            timestamptz not null default now(),
  requested_by            uuid        references auth.users(id),
  decided_at              timestamptz,
  decided_by              uuid        references auth.users(id),
  decision_notes          text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint admission_extensions_admission_centre_fkey
    foreign key (admission_id, centre_id) references admissions(id, centre_id),
  constraint admission_extensions_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint admission_extensions_additional_days_positive
    check (additional_days >= 1),
  constraint admission_extensions_reason_not_blank
    check (length(btrim(reason)) > 0),
  constraint admission_extensions_decision_consistent
    check (
      (status in ('approved', 'rejected') and decided_at is not null and decided_by is not null)
      or status = 'pending'
    )
);

comment on table admission_extensions is
  'One-row-per-request audit trail of stay extensions. On approval, app.decide_stay_extension updates admissions.current_planned_discharge_date.';

-- One pending extension per admission at a time. Rejected requests do not block future ones.
create unique index admission_extensions_one_pending_per_admission
  on admission_extensions (admission_id)
  where status = 'pending';

create index admission_extensions_admission_id_idx on admission_extensions (admission_id);

alter table admission_extensions enable row level security;
alter table admission_extensions force row level security;

-- Readable to anyone who can act on any part of the extension workflow.
create policy admission_extensions_read on admission_extensions for select to authenticated
  using (
    app.can_access_centre(centre_id)
    and (
      app.can_read('extension.initiate')
      or app.can_read('extension.approve')
    )
  );

revoke insert, update, delete on admission_extensions from authenticated, anon;

create trigger audit_admission_extensions
  after insert or update or delete on admission_extensions
  for each row execute function app.audit_row();

create trigger touch_admission_extensions
  before update on admission_extensions
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- app.request_stay_extension
-- ---------------------------------------------------------------------------

create or replace function app.request_stay_extension(
  p_admission_id  uuid,
  p_additional_days integer,
  p_reason        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adm    public.admissions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_orig   date;
  v_new    date;
  v_id     uuid;
begin
  if not app.has_permission('extension.initiate') then
    raise exception 'Not permitted to initiate a stay extension' using errcode = '42501';
  end if;

  if coalesce(p_additional_days, 0) < 1 then
    raise exception 'Additional days must be at least 1' using errcode = '22023';
  end if;

  if v_reason is null then
    raise exception 'A reason is required to request an extension' using errcode = '22023';
  end if;

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be extended' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.admission_extensions
    where admission_id = p_admission_id and status = 'pending'
  ) then
    raise exception 'A stay extension is already pending for this admission' using errcode = '23505';
  end if;

  v_orig := v_adm.current_planned_discharge_date;
  v_new  := v_orig + p_additional_days;

  insert into public.admission_extensions
    (admission_id, centre_id, original_discharge_date, additional_days, new_discharge_date, reason, requested_by)
  values
    (p_admission_id, v_adm.centre_id, v_orig, p_additional_days, v_new, v_reason, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.request_stay_extension is
  'Step 1: proposes a stay extension. Requires extension.initiate. A different person must approve via app.decide_stay_extension.';

-- ---------------------------------------------------------------------------
-- app.decide_stay_extension
-- ---------------------------------------------------------------------------

create or replace function app.decide_stay_extension(
  p_extension_id uuid,
  p_approve      boolean,
  p_notes        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ext  public.admission_extensions;
  v_note text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not app.has_permission('extension.approve') then
    raise exception 'Not permitted to approve or reject a stay extension' using errcode = '42501';
  end if;

  select * into v_ext from public.admission_extensions where id = p_extension_id;

  if v_ext.id is null or not app.can_access_centre(v_ext.centre_id) then
    raise exception 'Stay extension not found' using errcode = 'P0002';
  end if;

  if v_ext.status <> 'pending' then
    raise exception 'This extension has already been %', v_ext.status using errcode = '22023';
  end if;

  if v_ext.requested_by = auth.uid() then
    raise exception 'The person who requested an extension cannot approve or reject it' using errcode = '42501';
  end if;

  if not p_approve and v_note is null then
    raise exception 'A reason is required to reject an extension' using errcode = '22023';
  end if;

  update public.admission_extensions
     set status         = case when p_approve then 'approved' else 'rejected' end,
         decided_at     = pg_catalog.now(),
         decided_by     = auth.uid(),
         decision_notes = v_note
   where id = p_extension_id;

  -- Approval immediately updates the planned discharge date on the admission itself.
  if p_approve then
    update public.admissions
       set current_planned_discharge_date = v_ext.new_discharge_date,
           updated_by = auth.uid()
     where id = v_ext.admission_id;
  end if;
end;
$$;

comment on function app.decide_stay_extension is
  'Step 2: approves or rejects a stay extension. Requires extension.approve and a different person from the requester. Approval immediately updates admissions.current_planned_discharge_date.';

-- ---------------------------------------------------------------------------
-- app.request_transfer_discharge  (transfer-specific, with detail fields)
-- ---------------------------------------------------------------------------

create or replace function app.request_transfer_discharge(
  p_admission_id        uuid,
  p_reason              text,
  p_destination         text,
  p_treatment_type      text,
  p_duration_days       integer
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

  if v_reason is null then
    raise exception 'A reason is required to request a transfer' using errcode = '22023';
  end if;

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be transferred' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.discharge_requests
    where admission_id = p_admission_id and status = 'pending'
  ) then
    raise exception 'A discharge request is already pending for this admission' using errcode = '23505';
  end if;

  insert into public.discharge_requests
    (admission_id, centre_id, discharge_type, reason, requested_by,
     transfer_destination, transfer_treatment_type, transfer_duration_days)
  values
    (p_admission_id, v_adm.centre_id, 'transfer', v_reason, auth.uid(),
     nullif(btrim(coalesce(p_destination, '')), ''),
     nullif(btrim(coalesce(p_treatment_type, '')), ''),
     p_duration_days)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.request_transfer_discharge is
  'Variant of app.request_early_discharge for transfer type — also records destination, treatment type, and expected duration. Requires discharge.initiate.';

-- ---------------------------------------------------------------------------
-- Public wrappers + grants
-- ---------------------------------------------------------------------------

create or replace function public.request_stay_extension(
  p_admission_id uuid, p_additional_days integer, p_reason text
)
returns uuid
language sql security invoker set search_path = ''
as $$ select app.request_stay_extension(p_admission_id, p_additional_days, p_reason); $$;

create or replace function public.decide_stay_extension(
  p_extension_id uuid, p_approve boolean, p_notes text
)
returns void
language sql security invoker set search_path = ''
as $$ select app.decide_stay_extension(p_extension_id, p_approve, p_notes); $$;

create or replace function public.request_transfer_discharge(
  p_admission_id uuid, p_reason text, p_destination text, p_treatment_type text, p_duration_days integer
)
returns uuid
language sql security invoker set search_path = ''
as $$ select app.request_transfer_discharge(p_admission_id, p_reason, p_destination, p_treatment_type, p_duration_days); $$;

grant execute on function app.request_stay_extension(uuid, integer, text)             to authenticated;
grant execute on function app.decide_stay_extension(uuid, boolean, text)              to authenticated;
grant execute on function app.request_transfer_discharge(uuid, text, text, text, integer) to authenticated;
grant execute on function public.request_stay_extension(uuid, integer, text)          to authenticated;
grant execute on function public.decide_stay_extension(uuid, boolean, text)           to authenticated;
grant execute on function public.request_transfer_discharge(uuid, text, text, text, integer) to authenticated;
