-- 0016 · Private storage buckets and their access policies
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). 16 assertions passing (see 0017).
--
-- Type and size limits are set on the bucket, not only in the application. Enforcing at the bucket
-- means a caller cannot talk the client library into accepting a 400MB executable renamed to .png.
-- The application should validate too, for a better error message, but the bucket holds the line.
--
-- Every bucket is private. Access is by signed URL on short expiry, never a public path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('client-photos',     'client-photos',     false,  5 * 1024 * 1024,
     array['image/jpeg','image/png','image/webp']),
  ('client-documents',  'client-documents',  false, 20 * 1024 * 1024,
     array['application/pdf','image/jpeg','image/png',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('workbook-imports',  'workbook-imports',  false, 25 * 1024 * 1024,
     array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
           'application/vnd.ms-excel','text/csv']),
  ('generated-reports', 'generated-reports', false, 50 * 1024 * 1024,
     array['application/pdf','text/csv',
           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage access follows the same centre rules as every table.
--
-- Object paths are `{centre_id}/{client_id}/{filename}`, so the first segment identifies the centre
-- and a policy can resolve access without a lookup. A file whose path does not begin with a centre
-- the user can reach is invisible to them, including in directory listings.
-- ---------------------------------------------------------------------------
create or replace function app.storage_centre_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first text;
begin
  v_first := split_part(object_name, '/', 1);
  -- A malformed path resolves to null, and no centre check can be satisfied by null.
  -- Deny by construction rather than by remembering to check.
  if v_first !~ '^[0-9a-fA-F-]{36}$' then
    return null;
  end if;
  return v_first::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function app.storage_centre_id(text) to authenticated;

-- --- client-photos ---------------------------------------------------------
create policy client_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'client-photos'
         and app.can_access_centre(app.storage_centre_id(name))
         and app.can_read('photos.view'));

create policy client_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'client-photos'
              and app.can_access_centre(app.storage_centre_id(name))
              and app.has_permission('photos.upload'));

-- Deliberately no UPDATE or DELETE policy. A replacement is a new object plus a new client_photos
-- row; the previous one stays, because who someone looked like at admission is part of the
-- identification record.

-- --- client-documents ------------------------------------------------------
create policy client_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'client-documents'
         and app.can_access_centre(app.storage_centre_id(name))
         and app.can_read('clients.view_operational'));

create policy client_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents'
              and app.can_access_centre(app.storage_centre_id(name))
              and app.has_permission('admissions.edit'));

-- --- workbook-imports ------------------------------------------------------
-- The most sensitive bucket of the four: a source spreadsheet holds every client on the board at
-- once. Restricted to centre configuration rights both to write and to read back.
create policy workbook_imports_read on storage.objects for select to authenticated
  using (bucket_id = 'workbook-imports'
         and app.can_access_centre(app.storage_centre_id(name))
         and app.has_permission('centres.manage'));

create policy workbook_imports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'workbook-imports'
              and app.can_access_centre(app.storage_centre_id(name))
              and app.has_permission('centres.manage'));

-- --- generated-reports -----------------------------------------------------
-- Read-only to the browser: reports are written by trusted server-side workflows.
create policy generated_reports_read on storage.objects for select to authenticated
  using (bucket_id = 'generated-reports'
         and app.can_access_centre(app.storage_centre_id(name))
         and app.can_read('reports.view'));

comment on function app.storage_centre_id(text) is
  'First path segment as a centre uuid. Returns null for a malformed path, which denies access.';
