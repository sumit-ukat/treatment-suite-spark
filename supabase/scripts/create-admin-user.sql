-- Create the first platform administrator.
--
-- NOT a migration. Deliberately kept out of supabase/migrations/ for two reasons: it is
-- environment-specific (each environment gets its own administrator), and it takes a password as
-- input. Migrations are committed; passwords are not.
--
-- ============================================================================
-- BEFORE YOU RUN THIS
--
--  1. Replace BOTH placeholders below. Never commit a real password to this file.
--  2. Run it through the Supabase SQL editor or psql — not through a build step, and not through
--     anything that writes the statement to a log.
--  3. Change the password immediately after first login. A password typed into a SQL console has
--     been seen by whoever typed it and possibly by shell or query history.
--  4. Turn on leaked-password protection first: Authentication -> Policies -> "Prevent use of leaked
--     passwords". It checks against HaveIBeenPwned and will refuse anything already breached, which
--     catches the whole dictionary-word-plus-digits family before it ever reaches production.
--
-- This grants organisation-wide platform_admin: every centre, every permission, including
-- access.manage, which is the permission that lets a user grant access to others. Create as few of
-- these as possible, and prefer a scoped centre_manager assignment for day-to-day work.
-- ============================================================================

do $$
declare
  -- >>> REPLACE THESE TWO VALUES <<<
  v_email    text := 'REPLACE_ME@example.com';
  v_password text := 'REPLACE_WITH_A_STRONG_PASSWORD';
  v_name     text := 'REPLACE_ME';

  v_uid  uuid := gen_random_uuid();
  v_org  uuid;
  v_role uuid;
begin
  if v_email like 'REPLACE_ME%' or v_password like 'REPLACE_%' then
    raise exception 'Edit the placeholders at the top of this script before running it.';
  end if;

  select id into v_org  from organisations where slug = 'ukat';
  select id into v_role from roles where code = 'platform_admin';

  if v_org is null then
    raise exception 'Organisation not found. Run the migrations and seed first.';
  end if;

  if exists (select 1 from auth.users where email = v_email) then
    select id into v_uid from auth.users where email = v_email;
    update auth.users
       set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now(),
           -- Repair any NULL token column, for rows created before this was understood.
           confirmation_token         = coalesce(confirmation_token, ''),
           recovery_token             = coalesce(recovery_token, ''),
           email_change               = coalesce(email_change, ''),
           email_change_token_new     = coalesce(email_change_token_new, ''),
           email_change_token_current = coalesce(email_change_token_current, ''),
           phone_change               = coalesce(phone_change, ''),
           phone_change_token         = coalesce(phone_change_token, ''),
           reauthentication_token     = coalesce(reauthentication_token, '')
     where id = v_uid;
    raise notice 'Existing user %: password reset.', v_email;
  else
    -- The eight token columns MUST be '' and not NULL.
    --
    -- Supabase Auth (GoTrue) scans them into Go `string` fields, which cannot hold NULL. Leaving any
    -- of them NULL makes every sign-in fail with HTTP 500 "Database error querying schema" — a
    -- message that points nowhere near the actual cause. The column defaults do not save you here,
    -- because an explicit column list omitting them inserts NULL.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      json_build_object('display_name', v_name)::jsonb,
      false, false,
      '', '', '', '', '', '', '', ''
    );

    -- Supabase Auth needs a matching identity row for email/password sign-in to resolve.
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    values (
      gen_random_uuid(), v_uid, v_uid::text, 'email',
      json_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true)::jsonb,
      now(), now()
    );
    raise notice 'Created user %.', v_email;
  end if;

  insert into user_profiles (id, email, display_name, job_title)
  values (v_uid, v_email, v_name, 'Platform administrator')
  on conflict (id) do update
    set display_name = excluded.display_name, is_active = true;

  insert into user_access_assignments (user_id, role_id, scope_type, organisation_id, reason)
  select v_uid, v_role, 'organisation', v_org, 'Initial platform administrator'
  where not exists (
    select 1 from user_access_assignments
    where user_id = v_uid and role_id = v_role and organisation_id = v_org
  );

  raise notice 'Granted organisation-wide platform_admin to %.', v_email;
end;
$$;
