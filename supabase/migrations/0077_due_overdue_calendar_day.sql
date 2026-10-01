-- 0077 · Client Directory's "Due / Overdue" count should match the board's own Due today / Overdue
-- logic, not a plain `due_at <= now()` cutoff.
--
-- 0074/0075 approximated this as `due_at <= now()` — flagged in a comment there as NOT the exact
-- per-timezone "due today" logic the board computes client-side (domain/tasks.ts isOverdue /
-- board-data.ts isDueToday). That approximation only counts tasks whose deadline instant has
-- already passed, so a task due later *today* (e.g. 17:00 London, checked at 10:00) was silently
-- excluded — understating the column versus what staff see on the board for the same client.
--
-- The board's actual rule, mirrored here: a task counts if it isn't complete/cancelled/not-applicable,
-- and either its due instant has already passed (overdue), or its due date falls on today's calendar
-- date in the centre's timezone (due today, whether or not the instant itself has passed yet). Hardcoded
-- to Europe/London — same scoped assumption as PRIMROSE_LODGE_SETTINGS and DetailPanel.tsx's TODO,
-- since every configured centre today is Europe/London.

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
            and ct.status not in ('completed', 'cancelled', 'not_applicable')
            and (
              ct.due_at < now()
              or (ct.due_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date
            )
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

comment on function app.search_clients is
  'Client Directory search. last_due_overdue_tasks matches the board''s own Due today/Overdue rule: '
  'not complete/cancelled/not-applicable, and either already past its due instant or due on today''s '
  'calendar date in Europe/London. Migration 0077.';
