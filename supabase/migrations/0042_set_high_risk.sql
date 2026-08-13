-- 0042 · Toggle high-risk flag on an existing admission
--
-- At admit time high_risk is set inside app.admit_client (migration 0037/0038).
-- This RPC lets authorised staff change it after the client is already admitted.

create or replace function app.set_admission_high_risk(p_admission_id uuid, p_high_risk boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admissions a
    where a.id = p_admission_id and app.can_access_centre(a.centre_id)
  ) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  update public.admissions set high_risk = p_high_risk where id = p_admission_id;
end;
$$;

create or replace function public.set_admission_high_risk(p_admission_id uuid, p_high_risk boolean)
returns void language sql security invoker set search_path = ''
as $$ select app.set_admission_high_risk(p_admission_id, p_high_risk); $$;

grant execute on function app.set_admission_high_risk(uuid, boolean) to authenticated;
grant execute on function public.set_admission_high_risk(uuid, boolean) to authenticated;
