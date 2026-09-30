-- 0061 · Auto-complete the GP Summary task once every step in its log is filled in
--
-- The GP Summary Log (migration 0058) tracks five steps under the one client_tasks row: surgery
-- details, request sent, received, doctor informed, confirmed. Filling in all five used to leave
-- the task itself sitting "overdue" until someone also clicked its separate Complete button --
-- redundant once the log already says everything is done. Each of the three write RPCs that can
-- be the *last* step to land (save, mark_doctor_informed, mark_confirmed) now checks after its own
-- update whether all five are filled, and if so completes the task the same way
-- app.complete_client_task does (only when it isn't already completed/cancelled/not_applicable --
-- never re-completes or fights a status that already means something else).

create or replace function app.gp_summary_maybe_complete(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task   public.client_tasks;
  v_detail public.gp_summary_details;
begin
  select * into v_task from public.client_tasks where id = p_task_id;
  select * into v_detail from public.gp_summary_details where client_task_id = p_task_id;

  if v_task.id is null or v_detail.client_task_id is null then
    return;
  end if;

  if v_task.status in ('completed', 'cancelled', 'not_applicable') then
    return;
  end if;

  if v_detail.surgery_name is not null
     and v_detail.request_sent_at is not null
     and v_detail.received_at is not null
     and v_detail.doctor_informed_at is not null
     and v_detail.confirmed_checked_at is not null
  then
    perform app.complete_client_task(p_task_id, null);
  end if;
end;
$$;

comment on function app.gp_summary_maybe_complete is
  'Completes the GP Summary task once its whole log (surgery details, sent, received, doctor
   informed, confirmed) is filled in -- called at the end of gp_summary_save,
   gp_summary_mark_doctor_informed and gp_summary_mark_confirmed. Migration 0061.';

-- ─── Wire it into the three RPCs that can complete the set ─────────────────────────────────────────

create or replace function app.gp_summary_save(
  p_task_id          uuid,
  p_surgery_name     text default null,
  p_surgery_email    text default null,
  p_surgery_phone    text default null,
  p_request_sent_at  date default null,
  p_received_at      date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.client_tasks := app.gp_summary_task_or_raise(p_task_id);
begin
  insert into public.gp_summary_details (
    client_task_id, surgery_name, surgery_email, surgery_phone,
    request_sent_at, request_sent_by, received_at, updated_at
  )
  values (
    v_task.id,
    nullif(btrim(coalesce(p_surgery_name, '')), ''),
    nullif(btrim(coalesce(p_surgery_email, '')), ''),
    nullif(btrim(coalesce(p_surgery_phone, '')), ''),
    p_request_sent_at,
    case when p_request_sent_at is not null then auth.uid() else null end,
    p_received_at,
    pg_catalog.now()
  )
  on conflict (client_task_id) do update
     set surgery_name    = excluded.surgery_name,
         surgery_email   = excluded.surgery_email,
         surgery_phone   = excluded.surgery_phone,
         request_sent_at = excluded.request_sent_at,
         request_sent_by = case when excluded.request_sent_at is not null then auth.uid()
                                 else public.gp_summary_details.request_sent_by end,
         received_at     = excluded.received_at,
         updated_at      = pg_catalog.now();

  perform app.gp_summary_maybe_complete(v_task.id);
end;
$$;

grant execute on function app.gp_summary_save(uuid, text, text, text, date, date) to authenticated;

create or replace function app.gp_summary_mark_doctor_informed(p_task_id uuid, p_ukat_doctor text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.client_tasks := app.gp_summary_task_or_raise(p_task_id);
begin
  insert into public.gp_summary_details (client_task_id, doctor_informed_at, doctor_informed_by, ukat_doctor, updated_at)
  values (v_task.id, pg_catalog.now(), auth.uid(), nullif(btrim(coalesce(p_ukat_doctor, '')), ''), pg_catalog.now())
  on conflict (client_task_id) do update
     set doctor_informed_at = pg_catalog.now(),
         doctor_informed_by = auth.uid(),
         ukat_doctor        = coalesce(excluded.ukat_doctor, public.gp_summary_details.ukat_doctor),
         updated_at         = pg_catalog.now();

  perform app.gp_summary_maybe_complete(v_task.id);
end;
$$;

grant execute on function app.gp_summary_mark_doctor_informed(uuid, text) to authenticated;

create or replace function app.gp_summary_mark_confirmed(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.client_tasks := app.gp_summary_task_or_raise(p_task_id);
begin
  insert into public.gp_summary_details (client_task_id, confirmed_checked_at, confirmed_checked_by, updated_at)
  values (v_task.id, pg_catalog.now(), auth.uid(), pg_catalog.now())
  on conflict (client_task_id) do update
     set confirmed_checked_at = pg_catalog.now(),
         confirmed_checked_by = auth.uid(),
         updated_at           = pg_catalog.now();

  perform app.gp_summary_maybe_complete(v_task.id);
end;
$$;

grant execute on function app.gp_summary_mark_confirmed(uuid) to authenticated;
