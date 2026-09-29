-- 0060 · Undo for two more one-way "mark" actions
--
-- Same gap as migration 0059 (GP Summary sign-offs), found in two more places while auditing the
-- app for actions that stamp a state change with no way back:
--
--   1. app.resolve_concern (migration 0035) marks a safeguarding/risk concern resolved with no way
--      to reopen it if that was a mis-click — the worst kind of one-way mark to get wrong, since it
--      silently drops a concern off the "open concerns" count everywhere it's surfaced.
--   2. app.decide_discharge_request (migration 0027) approves/rejects a discharge request and then
--      refuses any further decision ("This request has already been approved/rejected"). Undoing
--      this one is safe only *before* app.finalise_discharge has consumed the approval — once a
--      request reaches 'finalised' it is a different, much bigger action to undo (bed/room state),
--      out of scope here.
--
-- Both new functions are otherwise the same shape as app.resolve_concern / app.decide_discharge_request:
-- same permission gate, same centre-access check, just reversing the one column set.

create or replace function app.reopen_concern(p_concern_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_centre_id uuid;
begin
  select centre_id into v_centre_id
  from public.client_concerns
  where id = p_concern_id and is_resolved = true;

  if not found then
    raise exception 'not_found' using hint = 'Concern not found or not resolved';
  end if;

  if not app.can_access_centre(v_centre_id) then
    raise exception 'not_authorised' using hint = 'No access to this centre';
  end if;

  update public.client_concerns set
    is_resolved   = false,
    resolved_by   = null,
    resolved_at   = null,
    resolved_note = null
  where id = p_concern_id;
end;
$$;

comment on function app.reopen_concern is
  'Undo for a mistakenly-resolved concern — clears is_resolved back to false. Mirrors
   app.resolve_concern''s own gating exactly. Migration 0060.';

grant execute on function app.reopen_concern(uuid) to authenticated;

create or replace function public.reopen_concern(p_concern_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.reopen_concern(p_concern_id);
$$;

grant execute on function public.reopen_concern(uuid) to authenticated;

-- ─── Undo a discharge-request decision, before it has been finalised ──────────────────────────────

create or replace function app.undecide_discharge_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.discharge_requests;
begin
  if not app.has_permission('discharge.approve') then
    raise exception 'Not permitted to change a discharge decision' using errcode = '42501';
  end if;

  select * into v_req from public.discharge_requests where id = p_request_id;

  if v_req.id is null or not app.can_access_centre(v_req.centre_id) then
    raise exception 'Discharge request not found' using errcode = 'P0002';
  end if;

  if v_req.status not in ('approved', 'rejected') then
    raise exception 'Only an approved or rejected request can be undone here' using errcode = '22023';
  end if;

  update public.discharge_requests
     set status           = 'pending',
         approved_at      = null,
         approved_by      = null,
         approval_notes   = null,
         rejected_at      = null,
         rejected_by      = null,
         rejection_reason = null
   where id = p_request_id;
end;
$$;

comment on function app.undecide_discharge_request is
  'Undo for a mistakenly approved/rejected discharge request, back to pending -- only while it is
   still unfinalised (app.finalise_discharge marks the underlying request ''finalised'', which this
   deliberately will not touch). Migration 0060.';

grant execute on function app.undecide_discharge_request(uuid) to authenticated;

create or replace function public.undecide_discharge_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.undecide_discharge_request(p_request_id);
$$;

grant execute on function public.undecide_discharge_request(uuid) to authenticated;
