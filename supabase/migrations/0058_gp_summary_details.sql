-- 0058 · GP Summary log details
--
-- Replaces the centre's manual "GP Summary Log" spreadsheet. That sheet tracks, per client, the GP
-- surgery's own contact details and a three-step sign-off trail around the GP Summary task the app
-- already has (client_tasks where code = 'gp_summary', due 3 days after admission): who sent the
-- request and when, when the summary came back, who told the UKAT doctor (and which doctor), and who
-- did the final check. KIPU MR Number (clients.reference, migration 0056) and Admission Date
-- (admissions.admitted_at) already exist in the app; everything below is what the sheet tracks that
-- didn't.
--
-- "Compliant Y/N" isn't a stored column — the sheet's own value can drift from the dates next to it.
-- app.gp_summary_get computes it from received_at vs the task's own due_at, so it can never disagree
-- with the data it's based on.
--
-- Every "who" column (sent by, doctor informed by, confirmed by) is stamped from auth.uid() by the
-- RPC that records that step, never typed in free text — the same rule app.discharge_log and
-- app.client_admission_history already follow for "who did this".

create table if not exists public.gp_summary_details (
  client_task_id      uuid primary key references public.client_tasks(id) on delete cascade,
  surgery_name        text,
  surgery_email       text,
  surgery_phone       text,
  request_sent_at     date,
  request_sent_by     uuid references auth.users(id),
  received_at         date,
  doctor_informed_at  timestamptz,
  doctor_informed_by  uuid references auth.users(id),
  ukat_doctor         text,
  confirmed_checked_at timestamptz,
  confirmed_checked_by uuid references auth.users(id),
  updated_at          timestamptz not null default now()
);

alter table public.gp_summary_details enable row level security;
-- No policies: every access goes through the security-definer RPCs below, same as client_tasks
-- itself (migration 0026) — there is nothing for a direct table grant to add.

comment on table public.gp_summary_details is
  'One row per GP Summary client_task, holding the surgery contact details and sign-off trail the
   old GP Summary Log spreadsheet tracked — migration 0058. Read and written only through
   app.gp_summary_get / app.gp_summary_save / app.gp_summary_mark_doctor_informed /
   app.gp_summary_mark_confirmed.';

-- ─── Helper: load + validate the underlying task, shared by every write RPC below ──────────────────

create or replace function app.gp_summary_task_or_raise(p_task_id uuid)
returns public.client_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.client_tasks;
begin
  if not app.has_permission('tasks.complete') then
    raise exception 'Not permitted to edit GP Summary details' using errcode = '42501';
  end if;

  select * into v_task from public.client_tasks where id = p_task_id;

  if v_task.id is null or not app.can_access_centre(v_task.centre_id) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if v_task.code is distinct from 'gp_summary' then
    raise exception 'Not a GP Summary task' using errcode = '22023';
  end if;

  return v_task;
end;
$$;

-- ─── Read ────────────────────────────────────────────────────────────────────────────────────────

create or replace function app.gp_summary_get(p_task_id uuid)
returns table (
  client_task_id        uuid,
  surgery_name           text,
  surgery_email          text,
  surgery_phone          text,
  request_sent_at        date,
  request_sent_by_name   text,
  received_at            date,
  compliant               boolean,
  doctor_informed_at     timestamptz,
  doctor_informed_by_name text,
  ukat_doctor             text,
  confirmed_checked_at   timestamptz,
  confirmed_checked_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_task public.client_tasks;
begin
  select * into v_task from public.client_tasks where id = p_task_id;

  if v_task.id is null or not app.can_access_centre(v_task.centre_id) then
    return;
  end if;

  if not app.can_read('clients.view_operational') then
    return;
  end if;

  return query
    select
      v_task.id,
      d.surgery_name,
      d.surgery_email,
      d.surgery_phone,
      d.request_sent_at,
      sent_by.display_name,
      d.received_at,
      case when d.received_at is null then null
           else d.received_at <= v_task.due_at::date
      end,
      d.doctor_informed_at,
      informed_by.display_name,
      d.ukat_doctor,
      d.confirmed_checked_at,
      confirmed_by.display_name
    from (select p_task_id as id) t
    left join public.gp_summary_details d on d.client_task_id = t.id
    left join public.user_profiles sent_by      on sent_by.id      = d.request_sent_by
    left join public.user_profiles informed_by  on informed_by.id  = d.doctor_informed_by
    left join public.user_profiles confirmed_by on confirmed_by.id = d.confirmed_checked_by;
end;
$$;

comment on function app.gp_summary_get is
  'One row (always) for a GP Summary task''s surgery contact + sign-off details, with compliant
   computed from received_at vs the task''s own due_at rather than stored — migration 0058.';

create or replace function public.gp_summary_get(p_task_id uuid)
returns table (
  client_task_id        uuid,
  surgery_name           text,
  surgery_email          text,
  surgery_phone          text,
  request_sent_at        date,
  request_sent_by_name   text,
  received_at            date,
  compliant               boolean,
  doctor_informed_at     timestamptz,
  doctor_informed_by_name text,
  ukat_doctor             text,
  confirmed_checked_at   timestamptz,
  confirmed_checked_by_name text
)
language sql
security invoker
set search_path = ''
as $$
  select * from app.gp_summary_get(p_task_id);
$$;

comment on function public.gp_summary_get is
  'Thin PostgREST-visible wrapper over app.gp_summary_get. All checks and logic live in the app schema.';

-- ─── Write: surgery contact + request-sent / received dates ────────────────────────────────────────

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
end;
$$;

comment on function app.gp_summary_save is
  'Upserts the GP Summary surgery contact details and the request-sent / received dates for one
   task. request_sent_by is stamped from auth.uid() whenever a request-sent date is present,
   never typed — migration 0058.';

grant execute on function app.gp_summary_task_or_raise(uuid) to authenticated;
grant execute on function app.gp_summary_get(uuid) to authenticated;
grant execute on function app.gp_summary_save(uuid, text, text, text, date, date) to authenticated;

create or replace function public.gp_summary_save(
  p_task_id          uuid,
  p_surgery_name     text default null,
  p_surgery_email    text default null,
  p_surgery_phone    text default null,
  p_request_sent_at  date default null,
  p_received_at      date default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.gp_summary_save(p_task_id, p_surgery_name, p_surgery_email, p_surgery_phone, p_request_sent_at, p_received_at);
$$;

grant execute on function public.gp_summary_get(uuid) to authenticated;
grant execute on function public.gp_summary_save(uuid, text, text, text, date, date) to authenticated;

-- ─── Write: the two sign-off steps ──────────────────────────────────────────────────────────────────

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
end;
$$;

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
end;
$$;

comment on function app.gp_summary_mark_doctor_informed is
  'Stamps "doctor informed" with the signed-in user and now() -- migration 0058.';
comment on function app.gp_summary_mark_confirmed is
  'Stamps the final "confirmed / checked" sign-off with the signed-in user and now() -- migration 0058.';

grant execute on function app.gp_summary_mark_doctor_informed(uuid, text) to authenticated;
grant execute on function app.gp_summary_mark_confirmed(uuid) to authenticated;

create or replace function public.gp_summary_mark_doctor_informed(p_task_id uuid, p_ukat_doctor text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.gp_summary_mark_doctor_informed(p_task_id, p_ukat_doctor);
$$;

create or replace function public.gp_summary_mark_confirmed(p_task_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.gp_summary_mark_confirmed(p_task_id);
$$;

grant execute on function public.gp_summary_mark_doctor_informed(uuid, text) to authenticated;
grant execute on function public.gp_summary_mark_confirmed(uuid) to authenticated;
