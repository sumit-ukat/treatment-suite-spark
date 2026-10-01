-- 0075 · search_clients was missing discharge_type — the Client Directory's Status column (Graduated
-- / Early Discharged / Transferred / Other) is derived from it, and 0074 forgot to return it.

drop function if exists app.search_clients(uuid, text);
drop function if exists public.search_clients(uuid, text);

create or replace function app.search_clients(p_centre_id uuid, p_query text)
returns table(
  client_id uuid,
  reference text,
  display_name text,
  has_open_admission boolean,
  last_admission_status text,
  last_admitted_at timestamptz,
  last_discharge_at timestamptz,
  last_discharge_type text,
  last_care_status text,
  last_discharge_reason text,
  last_discharge_sub_reason text,
  last_total_tasks bigint,
  last_completed_tasks bigint,
  last_due_overdue_tasks bigint
)
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_has_identity boolean := app.has_permission('clients.view_identity');
  v_query text := btrim(coalesce(p_query, ''));
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  if not app.can_read('clients.view_operational') and not v_has_identity then
    return;
  end if;

  if length(v_query) = 1 then
    return;
  end if;

  return query
    select
      c.id,
      c.reference,
      case when v_has_identity
        then trim(coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name)
        else null
      end,
      exists (
        select 1 from public.admissions op
        where op.client_id = c.id and op.status in ('planned', 'active')
      ),
      last_adm.status,
      last_adm.admitted_at,
      last_adm.actual_discharge_at,
      last_adm.discharge_type,
      last_adm.care_status,
      last_adm.discharge_reason,
      last_adm.discharge_sub_reason,
      coalesce(task_counts.total, 0),
      coalesce(task_counts.completed, 0),
      coalesce(task_counts.due_overdue, 0)
    from public.clients c
    join lateral (
      select a.id, a.status, a.admitted_at, a.actual_discharge_at, a.discharge_type, a.care_status,
             a.discharge_reason, a.discharge_sub_reason
      from public.admissions a
      where a.client_id = c.id and a.centre_id = p_centre_id
      order by a.admitted_at desc
      limit 1
    ) last_adm on true
    left join lateral (
      select
        count(*) as total,
        count(*) filter (where ct.status = 'completed') as completed,
        count(*) filter (
          where ct.due_at is not null
            and ct.due_at <= now()
            and ct.status not in ('completed', 'cancelled', 'not_applicable')
        ) as due_overdue
      from public.client_tasks ct
      where ct.admission_id = last_adm.id
    ) task_counts on true
    where
      v_query = ''
      or c.reference ilike ('%' || v_query || '%')
      or (
        v_has_identity
        and (
          c.first_name ilike ('%' || v_query || '%')
          or c.last_name ilike ('%' || v_query || '%')
          or c.preferred_name ilike ('%' || v_query || '%')
        )
      )
    order by last_adm.admitted_at desc
    limit 200;
end;
$$;

create or replace function public.search_clients(p_centre_id uuid, p_query text)
returns table(
  client_id uuid,
  reference text,
  display_name text,
  has_open_admission boolean,
  last_admission_status text,
  last_admitted_at timestamptz,
  last_discharge_at timestamptz,
  last_discharge_type text,
  last_care_status text,
  last_discharge_reason text,
  last_discharge_sub_reason text,
  last_total_tasks bigint,
  last_completed_tasks bigint,
  last_due_overdue_tasks bigint
)
language sql security invoker set search_path = ''
as $$
  select * from app.search_clients(p_centre_id, p_query);
$$;

grant execute on function app.search_clients(uuid, text)    to authenticated;
grant execute on function public.search_clients(uuid, text) to authenticated;
