-- 0085 · Tool feedback: report a bug or request a feature from inside the app
--
-- A durable in-app log is the source of truth ("tool issue log"); email notification is a later,
-- separate step (an Edge Function calling an external email provider) deliberately NOT built here —
-- the provider/API key isn't set up yet. `feedback_recipients` exists now so that step only has to
-- read this table, not design it.
--
-- Submission is open to every authenticated role, including View Only — anyone hitting a problem with
-- the tool should be able to say so regardless of their clinical permissions. Viewing the log and
-- managing the recipient list both reuse `administration.manage_users` rather than a new permission:
-- the same people who already manage who gets into the tool are the right people to triage complaints
-- about it.

create table tool_feedback (
  id              uuid primary key default gen_random_uuid(),

  kind            text not null check (kind in ('bug', 'feature_request')),
  description     text not null check (length(trim(description)) > 0),

  -- Auto-captured context ("then and there"), not user-entered — where they were when something went
  -- wrong matters more than asking them to describe it.
  page_path       text,
  centre_id       uuid references centres(id) on delete set null,

  -- Nullable: the screenshot is opt-in (it can show client data on screen). The image itself never
  -- leaves the app's own storage — an email notification would link to it, not attach it.
  screenshot_path text,

  status          text not null default 'open'
                    check (status in ('open', 'in_progress', 'resolved', 'wont_fix')),

  created_by      uuid references user_profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tool_feedback_created_idx on tool_feedback (created_at desc);
create index tool_feedback_status_idx  on tool_feedback (status) where status = 'open';

create table feedback_recipients (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  added_by    uuid references user_profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

insert into feedback_recipients (email) values ('bilal@ukat.co.uk');

create trigger touch_tool_feedback before update on tool_feedback
  for each row execute function app.touch_updated_at();

create trigger audit_tool_feedback after insert or update or delete on tool_feedback
  for each row execute function app.audit_row();
create trigger audit_feedback_recipients after insert or update or delete on feedback_recipients
  for each row execute function app.audit_row();

alter table tool_feedback       enable row level security;
alter table feedback_recipients enable row level security;
alter table tool_feedback       force row level security;
alter table feedback_recipients force row level security;

-- Anyone signed in can file a report, attributed to themselves — no other permission required.
create policy tool_feedback_insert on tool_feedback for insert to authenticated
  with check (created_by = auth.uid());

-- The log itself (the "tool issue log") is for whoever already manages user access.
create policy tool_feedback_read on tool_feedback for select to authenticated
  using (app.can_read('administration.manage_users'));

create policy tool_feedback_update on tool_feedback for update to authenticated
  using (app.has_permission('administration.manage_users'))
  with check (app.has_permission('administration.manage_users'));

-- Reports are a record of what was said and when; no delete policy, same reasoning as client_photos.
revoke delete on tool_feedback from authenticated, anon;

create policy feedback_recipients_read on feedback_recipients for select to authenticated
  using (app.can_read('administration.manage_users'));

create policy feedback_recipients_insert on feedback_recipients for insert to authenticated
  with check (app.has_permission('administration.manage_users') and added_by = auth.uid());

create policy feedback_recipients_delete on feedback_recipients for delete to authenticated
  using (app.has_permission('administration.manage_users'));

-- ---------------------------------------------------------------------------
-- Storage: screenshots live under `{uploader_id}/{uuid}.{ext}` — no centre segment, since feedback can
-- be filed from the group hub where there is no single centre to attribute it to.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('feedback-screenshots', 'feedback-screenshots', false, 5 * 1024 * 1024,
     array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy feedback_screenshots_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-screenshots' and split_part(name, '/', 1) = auth.uid()::text);

-- Visible to the person who took it (so the form can preview what it just uploaded) and to whoever
-- can see the log it's attached to.
create policy feedback_screenshots_read on storage.objects for select to authenticated
  using (bucket_id = 'feedback-screenshots'
         and (split_part(name, '/', 1) = auth.uid()::text
              or app.can_read('administration.manage_users')));

comment on table tool_feedback is
  'Bug reports and feature requests filed from inside the tool. Email notification to feedback_recipients is a separate, not-yet-built step.';
comment on table feedback_recipients is
  'Email addresses notified when new tool_feedback is filed. Managed by administration.manage_users holders.';
