// invite-user — the only place in this project the service_role key is ever used.
//
// Closes the other half of "onboard real staff" (migration 0030 closed granting/revoking a role for
// someone who already has a login; this creates the login). The service_role key can create an
// auth.users row directly and must never reach the browser — Edge Functions are the one place it can
// live, running server-side with the key injected as an environment variable, never bundled into the
// Vite app.
//
// Two permission checks happen, deliberately not just one:
//   1. Here, using a Supabase client scoped to the CALLER's own JWT (forwarded from the incoming
//      request) — calls public.has_permission('administration.manage_users') exactly as any other
//      screen would. This is the fast-fail: a clear 403 before the service_role key is ever touched.
//   2. Inside app.create_user_profile (migration 0031), re-checking the actor id this function hands
//      it, independently of step 1. If step 1 had a bug, step 2 still refuses. Never trust the
//      application layer alone for something this sensitive.
//
// createUser with a real password, by deliberate choice (confirmed with the product owner, who
// explicitly traded the alternative — inviteUserByEmail, where the new person sets their own
// password and no admin ever sees one — for the convenience of setting one directly at onboarding,
// matching the group's other internal tool). The admin either types a password or leaves it blank to
// get one auto-generated here; either way it comes back in this function's response ONCE, for the
// admin to relay to the new person themselves — never logged, never stored anywhere past this
// request. email_confirm: true, so the account is usable immediately with no email round-trip at all.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 16 characters from a charset with no visually-ambiguous glyphs (no 0/O, 1/I/l) — this gets read
 * aloud or typed by hand during onboarding, so ambiguity is a real support cost, not a theoretical one. */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let body: { email?: unknown; displayName?: unknown; jobTitle?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '';
  const requestedPassword = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email)) return json({ error: 'A valid email is required.' }, 400);
  if (!displayName) return json({ error: 'A display name is required.' }, 400);
  if (requestedPassword && requestedPassword.length < 8) {
    return json({ error: 'A temporary password must be at least 8 characters.' }, 400);
  }
  const password = requestedPassword || generatePassword();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not authenticated.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Server is not configured correctly.' }, 500);
  }

  // Scoped to the CALLER's own JWT — used only to find out who they are and whether they may do
  // this. The service_role key is not read until after this passes.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ error: 'Not authenticated.' }, 401);
  }
  const actorId = authData.user.id;

  const { data: canManage, error: permError } = await callerClient.rpc('has_permission', {
    perm_code: 'administration.manage_users',
  });
  if (permError) {
    return json({ error: `Could not verify permission: ${permError.message}` }, 500);
  }
  if (!canManage) {
    return json({ error: 'Not permitted to manage user access.' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    return json({ error: createError?.message ?? 'Could not create the login.' }, 400);
  }
  const newUserId = created.user.id;

  const { error: profileError } = await adminClient.rpc('create_user_profile', {
    p_user_id: newUserId,
    p_email: email,
    p_display_name: displayName,
    p_job_title: jobTitle || null,
    p_actor_id: actorId,
  });

  if (profileError) {
    // Best-effort: don't leave an invited-but-profileless login behind. If this itself fails, the
    // login still exists with no profile — visible nowhere in the app, and with zero permissions
    // (every permission check joins through user_profiles), so it is inert, not a security gap.
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return json({ error: profileError.message }, 400);
  }

  return json({ userId: newUserId, password }, 200);
});
