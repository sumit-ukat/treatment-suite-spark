-- 0082 · Drop app/public.centre_client_activity (migrations 0080/0081)
--
-- The Executive Hub feature it powered moved to the Client Directory instead (which computes the
-- same breakdown from search_clients' own already-loaded real data for its one real centre, no RPC
-- needed), so this is now unreferenced from any client. Dropped rather than left behind as dead
-- surface area nothing calls.

drop function if exists app.centre_client_activity(uuid, date, date);
drop function if exists public.centre_client_activity(uuid, date, date);
