-- 0035 · client_concerns — staff concern log, visible on both boards
--
-- STATUS: PENDING — not yet applied.
--
-- Any staff member with access to a centre can log a concern against a client's
-- active admission (a welfare note, a behaviour flag, a risk observation). Open
-- concerns appear as an amber ⚑ flag on the room board and treatment board so
-- every staff member immediately sees there is something to be aware of.
--
-- Pattern mirrors 0034: security-definer RPCs in the `app` schema own all auth
-- and business-logic checks; thin `public` wrappers expose them to PostgREST;
-- the table itself has no direct public INSERT/UPDATE (only SELECT via RLS).

create table if not exists client_concerns (
  id            uuid          default gen_random_uuid() primary key,
  client_id     uuid          not null references clients(id) on delete cascade,
  admission_id  uuid          not null references admissions(id) on delete cascade,
  centre_id     uuid          not null references centres(id) on delete cascade,
  note          text          not null check (char_length(trim(note)) > 0),
  category      text          not null default 'general'
                              check (category in ('behaviour','risk','medical','welfare','general')),
  logged_by     uuid          not null references auth.users(id),
  logged_at     timestamptz   not null default now(),
  is_resolved   boolean       not null default false,
  resolved_by   uuid          references auth.users(id),
  resolved_at   timestamptz,
  resolved_note text
);

-- Sparse index used by the board query — only unresolved rows.
create index client_concerns_open_idx
  on client_concerns (centre_id, client_id)
  where is_resolved = false;

alter table client_concerns enable row level security;

-- Any centre member can read concerns for their centre.
create policy "Centre members can read concerns"
  on client_concerns for select
  using (app.can_access_centre(centre_id));

-- ─── Log a concern ───────────────────────────────────────────────────────────

create or replace function app.log_concern(
  p_client_id     uuid,
  p_admission_id  uuid,
  p_centre_id     uuid,
  p_note          text,
  p_category      text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.can_access_centre(p_centre_id) then
    raise exception 'not_authorised' using hint = 'No access to this centre';
  end if;

  insert into public.client_concerns (
    client_id, admission_id, centre_id, note, category, logged_by
  ) values (
    p_client_id, p_admission_id, p_centre_id,
    trim(p_note), p_category, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.log_concern is
  'Log a staff concern against a client admission. Any centre member may call this; logged_by is always set to auth.uid().';

create or replace function public.log_concern(
  p_client_id     uuid,
  p_admission_id  uuid,
  p_centre_id     uuid,
  p_note          text,
  p_category      text default 'general'
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.log_concern(p_client_id, p_admission_id, p_centre_id, p_note, p_category);
$$;

comment on function public.log_concern is
  'PostgREST-visible wrapper over app.log_concern.';

grant execute on function app.log_concern(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.log_concern(uuid, uuid, uuid, text, text) to authenticated;

-- ─── List concerns for a client ──────────────────────────────────────────────

create or replace function app.list_concerns(p_centre_id uuid, p_client_id uuid)
returns table (
  id            uuid,
  note          text,
  category      text,
  logged_by_name text,
  logged_at     timestamptz,
  is_resolved   boolean,
  resolved_note text,
  resolved_at   timestamptz
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

  return query
    select
      cc.id,
      cc.note,
      cc.category,
      coalesce(up.display_name, 'Staff') as logged_by_name,
      cc.logged_at,
      cc.is_resolved,
      cc.resolved_note,
      cc.resolved_at
    from public.client_concerns cc
    left join public.user_profiles up on up.id = cc.logged_by
    where cc.centre_id = p_centre_id
      and cc.client_id = p_client_id
    order by cc.logged_at desc;
end;
$$;

comment on function app.list_concerns is
  'All concerns (open and resolved) for a client at one centre.';

create or replace function public.list_concerns(p_centre_id uuid, p_client_id uuid)
returns table (
  id            uuid,
  note          text,
  category      text,
  logged_by_name text,
  logged_at     timestamptz,
  is_resolved   boolean,
  resolved_note text,
  resolved_at   timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.list_concerns(p_centre_id, p_client_id);
$$;

grant execute on function app.list_concerns(uuid, uuid) to authenticated;
grant execute on function public.list_concerns(uuid, uuid) to authenticated;

-- ─── Open concern client IDs (board query) ───────────────────────────────────

create or replace function app.open_concern_client_ids(p_centre_id uuid)
returns table (client_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  return query
    select distinct cc.client_id
    from public.client_concerns cc
    where cc.centre_id = p_centre_id
      and cc.is_resolved = false;
end;
$$;

comment on function app.open_concern_client_ids is
  'Distinct client_ids that have at least one open (unresolved) concern at the given centre — used to set the flag on the room and treatment boards.';

create or replace function public.open_concern_client_ids(p_centre_id uuid)
returns table (client_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.open_concern_client_ids(p_centre_id);
$$;

grant execute on function app.open_concern_client_ids(uuid) to authenticated;
grant execute on function public.open_concern_client_ids(uuid) to authenticated;

-- ─── Resolve a concern ───────────────────────────────────────────────────────

create or replace function app.resolve_concern(p_concern_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_centre_id uuid;
begin
  select centre_id into v_centre_id
  from public.client_concerns
  where id = p_concern_id and is_resolved = false;

  if not found then
    raise exception 'not_found' using hint = 'Concern not found or already resolved';
  end if;

  if not app.can_access_centre(v_centre_id) then
    raise exception 'not_authorised' using hint = 'No access to this centre';
  end if;

  update public.client_concerns set
    is_resolved  = true,
    resolved_by  = auth.uid(),
    resolved_at  = now(),
    resolved_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_concern_id;
end;
$$;

comment on function app.resolve_concern is
  'Mark a concern as resolved. Any centre member may resolve any concern at their centre.';

create or replace function public.resolve_concern(p_concern_id uuid, p_note text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.resolve_concern(p_concern_id, p_note);
$$;

grant execute on function app.resolve_concern(uuid, text) to authenticated;
grant execute on function public.resolve_concern(uuid, text) to authenticated;
