-- 0048 · Edit client name post-admission
--
-- Lets authorised staff correct a client's first_name / last_name after
-- admission (e.g. a typo entered at intake). Requires clients.edit_identity.

-- App-schema implementation — permission check via app.has_permission()
create or replace function app.update_client_name(
  p_client_id  uuid,
  p_first_name text,
  p_last_name  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_permission('clients.edit_identity') then
    raise exception 'Not permitted to edit client identity' using errcode = '42501';
  end if;

  update public.clients
  set    first_name = btrim(p_first_name),
         last_name  = btrim(p_last_name),
         updated_at = now(),
         updated_by = auth.uid()
  where  id = p_client_id;
end;
$$;

-- PostgREST-visible wrapper (security invoker — RLS applies to the caller)
create or replace function public.update_client_name(
  p_client_id  uuid,
  p_first_name text,
  p_last_name  text
)
returns void
language sql security invoker set search_path = ''
as $$
  select app.update_client_name(p_client_id, p_first_name, p_last_name);
$$;

grant execute on function app.update_client_name(uuid, text, text)    to authenticated;
grant execute on function public.update_client_name(uuid, text, text) to authenticated;
