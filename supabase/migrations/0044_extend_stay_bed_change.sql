-- 0044 · Optional bed/room change during stay extension
--
-- Adds a p_new_bed_id parameter (default null) to apply_stay_extension.
-- When supplied, the function closes the client's current room allocation and
-- opens a new one for the chosen bed in the same atomic transaction.
--
-- The existing half-open exclusion constraint on room_allocations naturally
-- prevents double-booking: if the target bed is already occupied the insert
-- fails before the extension record is committed.

-- Drop the old 3-parameter overloads from migration 0043 before replacing.
drop function if exists app.apply_stay_extension(uuid, integer, text);
drop function if exists public.apply_stay_extension(uuid, integer, text);

create or replace function app.apply_stay_extension(
  p_admission_id    uuid,
  p_additional_days integer,
  p_reason          text,
  p_new_bed_id      uuid default null
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
  v_now    timestamptz := pg_catalog.now();
begin
  if not app.has_permission('extension.initiate') then
    raise exception 'Not permitted to extend a stay' using errcode = '42501';
  end if;

  if coalesce(p_additional_days, 0) < 1 then
    raise exception 'Additional days must be at least 1' using errcode = '22023';
  end if;

  if v_reason is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_adm from public.admissions where id = p_admission_id;

  if v_adm.id is null or not app.can_access_centre(v_adm.centre_id) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  if v_adm.status <> 'active' then
    raise exception 'Only an active admission can be extended' using errcode = '22023';
  end if;

  -- Validate the new bed when one is supplied: must exist, be in the same
  -- centre, and currently have available status.
  if p_new_bed_id is not null then
    if not exists (
      select 1
        from public.beds b
        join public.rooms r on r.id = b.room_id
       where b.id         = p_new_bed_id
         and b.centre_id  = v_adm.centre_id
         and b.status     = 'available'
         and r.status     = 'available'
    ) then
      raise exception 'Bed not found or not available in this centre' using errcode = 'P0002';
    end if;
  end if;

  v_orig := v_adm.current_planned_discharge_date;
  v_new  := v_orig + p_additional_days;

  insert into public.admission_extensions
    (admission_id, centre_id, original_discharge_date, additional_days, new_discharge_date,
     reason, status, requested_by, decided_at, decided_by)
  values
    (p_admission_id, v_adm.centre_id, v_orig, p_additional_days, v_new,
     v_reason, 'approved', auth.uid(), v_now, auth.uid())
  returning id into v_id;

  update public.admissions
     set current_planned_discharge_date = v_new,
         updated_by                     = auth.uid()
   where id = p_admission_id;

  -- Move the client to the new bed when one was chosen.
  if p_new_bed_id is not null then
    -- Close the current open allocation.
    update public.room_allocations
       set ended_at        = v_now,
           ended_by        = auth.uid(),
           transfer_reason = v_reason
     where admission_id = p_admission_id
       and ended_at is null;

    -- Open the new allocation starting at the same instant — the half-open
    -- range [v_now, ∞) is compatible with the just-closed [start, v_now).
    insert into public.room_allocations
      (admission_id, bed_id, centre_id, started_at, allocated_by)
    values
      (p_admission_id, p_new_bed_id, v_adm.centre_id, v_now, auth.uid());
  end if;

  return v_id;
end;
$$;

comment on function app.apply_stay_extension is
  'Extends a client''s planned stay immediately — no second-person approval. '
  'Optionally moves the client to a different bed in the same transaction. '
  'Requires extension.initiate. Writes an approved extension record and updates '
  'admissions.current_planned_discharge_date.';

-- Recreate the public wrapper with the new signature.
create or replace function public.apply_stay_extension(
  p_admission_id    uuid,
  p_additional_days integer,
  p_reason          text,
  p_new_bed_id      uuid default null
)
returns uuid
language sql security invoker set search_path = ''
as $$
  select app.apply_stay_extension(p_admission_id, p_additional_days, p_reason, p_new_bed_id);
$$;

grant execute on function app.apply_stay_extension(uuid, integer, text, uuid)    to authenticated;
grant execute on function public.apply_stay_extension(uuid, integer, text, uuid) to authenticated;
