-- 0041 · Store display name alongside admission notes editor
--
-- The 0039 RPC stored auth.uid() but not the human-readable name, so the UI
-- had no way to show who last edited the notes without an extra join.
-- This adds the name column and updates the RPC to fill it in.

alter table public.admissions
  add column if not exists admission_notes_updated_by_name text;

create or replace function app.update_admission_notes(p_admission_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  if not exists (
    select 1 from public.admissions a
    where a.id = p_admission_id and app.can_access_centre(a.centre_id)
  ) then
    raise exception 'Admission not found' using errcode = 'P0002';
  end if;

  select display_name into v_display_name from public.user_profiles where id = auth.uid();

  update public.admissions set
    admission_notes                  = nullif(btrim(coalesce(p_notes, '')), ''),
    admission_notes_updated_by       = auth.uid(),
    admission_notes_updated_by_name  = coalesce(v_display_name, 'Staff'),
    admission_notes_updated_at       = now()
  where id = p_admission_id;
end;
$$;

create or replace function public.update_admission_notes(p_admission_id uuid, p_notes text)
returns void language sql security invoker set search_path = ''
as $$ select app.update_admission_notes(p_admission_id, p_notes); $$;

grant execute on function app.update_admission_notes(uuid, text) to authenticated;
grant execute on function public.update_admission_notes(uuid, text) to authenticated;
