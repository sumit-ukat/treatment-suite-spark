-- 0054 · Manual (custom) task assignments
--
-- Adds an `origin` flag to client_tasks so a manually-added task is always
-- distinguishable from a template-generated one, even after the template is
-- deleted (which sets template_id to null and would otherwise make them
-- indistinguishable).
--
-- Two new public RPCs:
--   add_manual_task    — insert a manual client_task on an active admission
--   delete_manual_task — remove a manual task (template tasks are undeletable)

alter table public.client_tasks
  add column if not exists origin text not null default 'template'
    check (origin in ('template', 'manual'));

-- Existing rows keep 'template' — no backfill needed. Imported rows that have
-- null template_id because they predate this feature are still template-derived
-- conceptually; treating them as 'manual' would make them deletable, which is
-- wrong.

-- ─── add_manual_task ─────────────────────────────────────────────────────────

create or replace function public.add_manual_task(
  p_admission_id  uuid,
  p_title         text,
  p_category      text        default 'milestone',
  p_due_at        timestamptz default null,
  p_description   text        default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_centre  uuid;
  v_task_id uuid;
begin
  select centre_id into v_centre
    from public.admissions
   where id = p_admission_id
     and status = 'active';

  if not found then
    raise exception 'Admission not found or not active';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'Task title is required';
  end if;

  if p_category not in ('family_contact','milestone','session','medical','admin','discharge','survey','detox') then
    raise exception 'Invalid category';
  end if;

  insert into public.client_tasks (
    admission_id,
    centre_id,
    template_id,
    code,
    category,
    title,
    description,
    due_at,
    status,
    origin,
    created_by
  ) values (
    p_admission_id,
    v_centre,
    null,
    null,
    coalesce(p_category, 'milestone'),
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    p_due_at,
    'not_started',
    'manual',
    auth.uid()
  )
  returning id into v_task_id;

  return v_task_id;
end;
$$;

grant execute on function public.add_manual_task(uuid, text, text, timestamptz, text)
  to authenticated;

-- ─── delete_manual_task ──────────────────────────────────────────────────────

create or replace function public.delete_manual_task(
  p_task_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.client_tasks
   where id = p_task_id
     and origin = 'manual';

  if not found then
    raise exception 'Task not found or is not a manually-added task';
  end if;
end;
$$;

grant execute on function public.delete_manual_task(uuid)
  to authenticated;
