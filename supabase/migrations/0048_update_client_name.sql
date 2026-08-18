-- RPC: update_client_name
-- Lets authorised staff correct a client's first_name / last_name after admission.
-- Permission check mirrors the pattern in 0028 / 0047.

create or replace function update_client_name(
  p_client_id uuid,
  p_first_name text,
  p_last_name  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Require clients.edit_identity permission
  if not exists (
    select 1
    from   user_centre_roles ucr
    join   role_permissions  rp  on rp.role_id = ucr.role_id
    join   permissions       p   on p.id = rp.permission_id
    where  ucr.user_id = auth.uid()
    and    p.name      = 'clients.edit_identity'
  ) then
    raise exception 'permission denied: clients.edit_identity';
  end if;

  update clients
  set    first_name = trim(p_first_name),
         last_name  = trim(p_last_name),
         updated_at = now()
  where  id = p_client_id;
end;
$$;
