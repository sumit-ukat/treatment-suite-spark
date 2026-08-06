-- 0029 · app.client_admission_history — the data behind a client file screen
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-06).
--
-- The gap: once a client is discharged, they vanish from the room board entirely (it only reads
-- `admissions` with `status = 'active'`), and the Clients directory (migration 0028) shows only a
-- one-line search result — a name/reference and a status chip, nothing else. There has never been
-- anywhere in this application to see a discharged client's admission at all, let alone their history
-- across more than one stay at the same centre. This function is the data behind closing that: a
-- client file screen, linked from a directory search result.
--
-- Scoped to (client_id, centre_id) together, not client_id alone — same "no data sharing between
-- centres" boundary as `app.search_clients`, and for the same reason: this product's centres do not
-- share client history with each other, so a client file at one centre shows only that centre's
-- admissions, never a stay recorded elsewhere.
--
-- What is NOT split by clients.view_identity here: staff labels (therapist/buddy/doctor). Those
-- describe the ADMISSION, not the client's own identity — the room board already shows them to anyone
-- who can see the board at all, regardless of clients.view_identity, and a client file should not be
-- more restrictive than the board is about the exact same facts.
--
-- Deliberately NOT duplicated here: live task management. The active admission's tasks already have a
-- full Mark done / Reopen UI on the room board (migration 0026) with its own permission checks;
-- rebuilding that inside a client file would be two copies of the same logic to keep in sync for no
-- real gain. This function returns only a completed/total task count per admission, enough to show
-- "12 of 20 complete" in a history list — the frontend can still add a "view on the room board" link
-- for whichever admission is currently active, since only one can be at a time.
create or replace function app.client_admission_history(p_client_id uuid, p_centre_id uuid)
returns table (
  admission_id uuid,
  status text,
  admitted_at timestamptz,
  planned_duration integer,
  planned_duration_unit text,
  original_planned_discharge_date date,
  current_planned_discharge_date date,
  actual_discharge_at timestamptz,
  discharge_type text,
  treatment_group text,
  substance_name text,
  peep_required boolean,
  bed_label text,
  therapist_label text,
  buddy_label text,
  doctor_label text,
  completed_task_count integer,
  total_task_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  if not app.can_read('clients.view_operational') and not app.has_permission('clients.view_identity') then
    return;
  end if;

  return query
    select
      a.id,
      a.status,
      a.admitted_at,
      a.planned_duration,
      a.planned_duration_unit,
      a.original_planned_discharge_date,
      a.current_planned_discharge_date,
      a.actual_discharge_at,
      a.discharge_type,
      a.treatment_group,
      sub.name,
      a.peep_required,
      bed.label,
      ther.display_label,
      buddy.display_label,
      doc.display_label,
      coalesce(tc.completed_count, 0)::integer,
      coalesce(tc.total_count, 0)::integer
    from public.admissions a
    left join public.substances sub on sub.id = a.primary_substance_id
    -- Earliest allocation, not latest: if an admission is ever transferred between beds (the
    -- `transfer_reason` column on room_allocations anticipates this, though no UI creates a second
    -- allocation mid-stay yet), the bed the client was ADMITTED to is the more useful single fact for
    -- a history list than wherever they ended up.
    left join lateral (
      select b.label
      from public.room_allocations ra
      join public.beds b on b.id = ra.bed_id
      where ra.admission_id = a.id
      order by ra.started_at asc
      limit 1
    ) bed on true
    left join lateral (
      select sa.display_label from public.staff_assignments sa
      where sa.admission_id = a.id and sa.role_code = 'focal_therapist' and sa.ended_at is null
      order by sa.started_at desc limit 1
    ) ther on true
    left join lateral (
      select sa.display_label from public.staff_assignments sa
      where sa.admission_id = a.id and sa.role_code = 'buddy' and sa.ended_at is null
      order by sa.started_at desc limit 1
    ) buddy on true
    left join lateral (
      select sa.display_label from public.staff_assignments sa
      where sa.admission_id = a.id and sa.role_code = 'doctor' and sa.ended_at is null
      order by sa.started_at desc limit 1
    ) doc on true
    left join lateral (
      select
        count(*) filter (where ct.status = 'completed') as completed_count,
        count(*) as total_count
      from public.client_tasks ct
      where ct.admission_id = a.id
    ) tc on true
    where a.client_id = p_client_id and a.centre_id = p_centre_id
    order by a.admitted_at desc;
end;
$$;

comment on function app.client_admission_history is
  'Every admission a client has had at one centre, past and present, with staff labels and a task-completion tally. Requires clients.view_operational or clients.view_identity, and centre access — mirrors app.search_clients.';

create or replace function public.client_admission_history(p_client_id uuid, p_centre_id uuid)
returns table (
  admission_id uuid,
  status text,
  admitted_at timestamptz,
  planned_duration integer,
  planned_duration_unit text,
  original_planned_discharge_date date,
  current_planned_discharge_date date,
  actual_discharge_at timestamptz,
  discharge_type text,
  treatment_group text,
  substance_name text,
  peep_required boolean,
  bed_label text,
  therapist_label text,
  buddy_label text,
  doctor_label text,
  completed_task_count integer,
  total_task_count integer
)
language sql
security invoker
set search_path = ''
as $$
  select * from app.client_admission_history(p_client_id, p_centre_id);
$$;

comment on function public.client_admission_history is
  'Thin PostgREST-visible wrapper over app.client_admission_history. All checks and logic live in the app schema.';

grant execute on function app.client_admission_history(uuid, uuid) to authenticated;
grant execute on function public.client_admission_history(uuid, uuid) to authenticated;
