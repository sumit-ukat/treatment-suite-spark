-- 0068 · Edit client KIPU No. (reference) after admission
--
-- A client can be admitted before their real KIPU number is known (e.g. imported from a source that
-- didn't carry one, or entered as a placeholder in a hurry) — this lets authorised staff set or
-- correct it afterward. Mirrors update_client_name (0048) exactly, plus a friendly error on the
-- existing unique (organisation_id, reference) constraint from migration 0004 instead of a raw
-- Postgres constraint-violation message.

create or replace function app.update_client_reference(
  p_client_id uuid,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not app.has_permission('clients.edit_identity') then
    raise exception 'Not permitted to edit client identity' using errcode = '42501';
  end if;

  if v_reference is null then
    raise exception 'A Kipu No. is required' using errcode = '22023';
  end if;

  begin
    update public.clients
    set    reference  = v_reference,
           updated_at = now(),
           updated_by = auth.uid()
    where  id = p_client_id;
  exception when unique_violation then
    raise exception 'That Kipu No. is already in use by another client' using errcode = '23505';
  end;
end;
$$;

create or replace function public.update_client_reference(
  p_client_id uuid,
  p_reference text
)
returns void
language sql security invoker set search_path = ''
as $$
  select app.update_client_reference(p_client_id, p_reference);
$$;

grant execute on function app.update_client_reference(uuid, text)    to authenticated;
grant execute on function public.update_client_reference(uuid, text) to authenticated;

comment on function app.update_client_reference is
  'Set or correct a client''s Kipu No. (reference) after admission. Requires clients.edit_identity.
   Migration 0068.';
