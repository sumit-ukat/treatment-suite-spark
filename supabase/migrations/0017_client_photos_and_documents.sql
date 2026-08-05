-- 0017 · Client photographs and documents
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). 16 assertions passing.
--
-- Photographs exist to answer one question at handover: is this the right person? That makes
-- verification the point rather than decoration. A photograph nobody has confirmed might be of
-- someone else, so "unverified" is a real state that has to be visible — which is why every import
-- lands unverified rather than being assumed correct.

create table client_photos (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete restrict,

  -- Denormalised so storage paths and RLS agree without a join, and so a photograph stays
  -- attributable to the centre that took it even after the client moves on.
  centre_id       uuid not null references centres(id) on delete restrict,

  storage_bucket  text not null default 'client-photos',
  -- `{centre_id}/{client_id}/{uuid}.{ext}` — the shape the storage policies parse.
  storage_path    text not null unique,

  safe_filename     text not null,
  original_filename text,
  mime_type         text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  file_size_bytes   integer not null check (file_size_bytes > 0 and file_size_bytes <= 5 * 1024 * 1024),

  uploaded_by     uuid references user_profiles(id) on delete set null,
  uploaded_at     timestamptz not null default now(),

  verification_status text not null default 'unverified'
                        check (verification_status in ('unverified','verified','rejected')),
  verified_by      uuid references user_profiles(id) on delete set null,
  verified_at      timestamptz,
  rejection_reason text,

  replaces_photo_id uuid references client_photos(id) on delete set null,
  is_active        boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- "Verified" is a claim about who checked and when. Without both it is just a word.
  constraint verified_has_verifier check (
    (verification_status = 'verified' and verified_by is not null and verified_at is not null)
    or (verification_status <> 'verified' and verified_at is null)
  ),
  constraint rejected_has_reason check (
    verification_status <> 'rejected'
    or (rejection_reason is not null and length(trim(rejection_reason)) > 0)
  )
);

-- One active photograph per client; a replacement deactivates the previous one.
create unique index client_photos_one_active on client_photos (client_id) where is_active;
create index client_photos_client_idx on client_photos (client_id, uploaded_at desc);
create index client_photos_centre_idx on client_photos (centre_id) where is_active;
-- Behind the "missing or unverified photograph" count on every dashboard.
create index client_photos_unverified_idx on client_photos (centre_id)
  where is_active and verification_status <> 'verified';

create table documents (
  id              uuid primary key default gen_random_uuid(),
  admission_id    uuid,
  centre_id       uuid not null,
  client_id       uuid references clients(id) on delete restrict,

  storage_bucket  text not null default 'client-documents',
  storage_path    text not null unique,

  title           text not null,
  category        text not null default 'general' check (category in
                    ('general','gp_summary','discharge_summary','consent','assessment','correspondence')),
  safe_filename     text not null,
  original_filename text,
  mime_type         text not null,
  file_size_bytes   integer not null check (file_size_bytes > 0),

  -- A document can hold clinical content, so the level decides who may open it.
  visibility_level smallint not null default 2 check (visibility_level between 1 and 4),

  uploaded_by     uuid references user_profiles(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (admission_id, centre_id) references admissions(id, centre_id)
);

create index documents_admission_idx on documents (admission_id) where is_active;
create index documents_centre_idx    on documents (centre_id, category) where is_active;

create trigger touch_client_photos before update on client_photos
  for each row execute function app.touch_updated_at();
create trigger touch_documents before update on documents
  for each row execute function app.touch_updated_at();

create trigger audit_client_photos after insert or update or delete on client_photos
  for each row execute function app.audit_row();
create trigger audit_documents after insert or update or delete on documents
  for each row execute function app.audit_row();

alter table client_photos enable row level security;
alter table documents     enable row level security;
alter table client_photos force row level security;
alter table documents     force row level security;

create policy client_photos_read on client_photos for select to authenticated
  using (app.can_access_centre(centre_id) and app.can_read('photos.view'));

create policy client_photos_insert on client_photos for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('photos.upload'));

-- Verification is a separate permission from upload, so the two can be held by different people.
-- Whether the same person may verify their own upload is OPEN_QUESTIONS Q43.
create policy client_photos_update on client_photos for update to authenticated
  using (app.can_access_centre(centre_id)
         and (app.has_permission('photos.verify') or app.has_permission('photos.upload')))
  with check (app.can_access_centre(centre_id));

-- Visibility level gates the document, not merely its title.
create policy documents_read on documents for select to authenticated
  using (
    app.can_access_centre(centre_id)
    and (
      visibility_level <= 1 and app.can_read('clients.view_operational')
      or visibility_level = 2 and app.can_read('treatment.view')
      or visibility_level >= 3 and app.can_read('medical.view_detail')
    )
  );

create policy documents_insert on documents for insert to authenticated
  with check (app.can_access_centre(centre_id) and app.has_permission('admissions.edit'));

create policy documents_update on documents for update to authenticated
  using (app.can_access_centre(centre_id) and app.has_permission('admissions.edit'))
  with check (app.can_access_centre(centre_id));

-- Files are evidence of identity. Deactivate, never remove.
revoke delete on client_photos, documents from authenticated, anon;

comment on table client_photos is
  'One active photo per client. Replacements supersede rather than overwrite; DELETE revoked.';
comment on column client_photos.verification_status is
  'Imports land unverified. An unconfirmed photo may be the wrong person, so the state must show.';
