import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client.
 *
 * Uses the **publishable** key, which is designed to ship in a browser bundle. It is not a secret and
 * carries no privileges of its own — every request it makes is still evaluated by RLS against the
 * signed-in user's assignments. What must never appear here is the `service_role` key: that bypasses
 * RLS entirely and belongs only in a server environment.
 *
 * Configuration is read from the environment rather than hard-coded, so dev and production cannot
 * accidentally share a database. A missing value is surfaced as a clear message rather than a crash
 * at the first query.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigError: string | null =
  !url || !publishableKey
    ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild.'
    : null;

export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Tokens live in localStorage by default. Acceptable for a preview; a production review
          // should weigh this against httpOnly cookies via a server session, which resists XSS
          // token theft. Recorded in docs/SECURITY_MODEL.md as an open item.
          detectSessionInUrl: false,
        },
      })
    : null;
