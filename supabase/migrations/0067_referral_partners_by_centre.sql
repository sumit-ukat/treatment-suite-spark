-- 0067 · Read/create referral partners by centre, not organisation
--
-- The discharge dialog and Discharge log only ever know the current centreId, not an
-- organisationId — nothing else in the frontend carries that around. These two RPCs resolve the
-- organisation from the centre server-side, so the client never needs to know or pass it.

create or replace function app.referral_partners_for_centre(p_centre_id uuid)
returns setof public.referral_partners
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not app.can_access_centre(p_centre_id) then
    return;
  end if;

  select organisation_id into v_org from public.centres where id = p_centre_id;
  if v_org is null then
    return;
  end if;

  return query
    select * from public.referral_partners
     where organisation_id = v_org and is_active
     order by name;
end;
$$;

comment on function app.referral_partners_for_centre is
  'Active referral partners for the organisation a centre belongs to. Migration 0067.';

create or replace function public.referral_partners_for_centre(p_centre_id uuid)
returns setof public.referral_partners
language sql security invoker set search_path = ''
as $$
  select * from app.referral_partners_for_centre(p_centre_id);
$$;

grant execute on function app.referral_partners_for_centre(uuid)    to authenticated;
grant execute on function public.referral_partners_for_centre(uuid) to authenticated;

create or replace function app.create_referral_partner(p_centre_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id  uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not (app.has_permission('discharge.initiate') or app.has_permission('discharge.finalise')) then
    raise exception 'Not permitted to add a referral partner' using errcode = '42501';
  end if;
  if not app.can_access_centre(p_centre_id) then
    raise exception 'Not permitted to access this centre' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'A name is required' using errcode = '22023';
  end if;

  select organisation_id into v_org from public.centres where id = p_centre_id;
  if v_org is null then
    raise exception 'Centre not found' using errcode = 'P0002';
  end if;

  insert into public.referral_partners (organisation_id, name, created_by)
  values (v_org, v_name, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.create_referral_partner is
  'Adds a new referral partner for the organisation a centre belongs to. Requires discharge.initiate
   or discharge.finalise. Migration 0067.';

create or replace function public.create_referral_partner(p_centre_id uuid, p_name text)
returns uuid
language sql security invoker set search_path = ''
as $$
  select app.create_referral_partner(p_centre_id, p_name);
$$;

grant execute on function app.create_referral_partner(uuid, text)    to authenticated;
grant execute on function public.create_referral_partner(uuid, text) to authenticated;
