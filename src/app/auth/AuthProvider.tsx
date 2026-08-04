import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from '../../lib/supabase.js';

/**
 * Session, profile and permission state.
 *
 * The permission list here is for **rendering only** — deciding which buttons to show. It is never
 * the security boundary. Every read and write is independently evaluated by RLS against the user's
 * assignments, so a tampered client can hide nothing and unlock nothing. Hiding a button is a
 * courtesy; the database is the control.
 */

export interface AccessibleCentre {
  id: string;
  name: string;
  slug: string;
  zoneName: string | null;
}

export interface AuthState {
  status: 'loading' | 'signed_out' | 'signed_in' | 'no_access' | 'unconfigured' | 'error';
  loadError: string | null;
  session: Session | null;
  displayName: string | null;
  email: string | null;
  jobTitle: string | null;
  roleNames: readonly string[];
  permissions: ReadonlySet<string>;
  centres: readonly AccessibleCentre[];
  configError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

interface ProfileRow {
  display_name: string;
  email: string;
  job_title: string | null;
}

interface AssignmentRow {
  roles: { name: string; role_permissions: { permissions: { code: string } }[] } | null;
}

interface CentreRow {
  id: string;
  name: string;
  slug: string;
  zones: { name: string } | null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>(
    supabaseConfigError ? 'unconfigured' : 'loading',
  );
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [roleNames, setRoleNames] = useState<readonly string[]>([]);
  const [permissions, setPermissions] = useState<ReadonlySet<string>>(new Set());
  const [centres, setCentres] = useState<readonly AccessibleCentre[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * Load everything the signed-in user can actually reach.
   *
   * Note there is no `where user_id = me` filter on the centres query. It is not needed: RLS returns
   * only reachable rows, so an unassigned user gets an empty array from `select *`. That is the
   * intended shape — the filter lives in the database, not in this file.
   */
  const loadAccess = useCallback(async () => {
    if (!supabase) return;

    // No spaces in these select strings. PostgREST parses the `select` parameter literally, so
    // 'roles(name, role_permissions(...))' asks for a column called " role_permissions" and fails.
    // The failure is a 400, not an exception — which is why every response is checked below.
    const [profileRes, assignmentRes, centreRes] = await Promise.all([
      supabase.from('user_profiles').select('display_name,email,job_title').maybeSingle(),
      supabase
        .from('user_access_assignments')
        .select('roles(name,role_permissions(permissions(code)))'),
      supabase.from('centres').select('id,name,slug,zones(name)').order('name'),
    ]);

    // Surface failures instead of letting them degrade into an empty result. A permission query that
    // silently returns nothing looks identical to a user with no permissions, and quietly showing
    // someone less than they are entitled to is its own kind of wrong.
    const failure = profileRes.error ?? assignmentRes.error ?? centreRes.error;
    if (failure) {
      setLoadError(failure.message);
      setStatus('error');
      return;
    }
    setLoadError(null);

    setProfile((profileRes.data as ProfileRow | null) ?? null);

    const assignments = (assignmentRes.data ?? []) as unknown as AssignmentRow[];
    const perms = new Set<string>();
    const names = new Set<string>();
    for (const a of assignments) {
      if (!a.roles) continue;
      names.add(a.roles.name);
      for (const rp of a.roles.role_permissions ?? []) {
        if (rp.permissions?.code) perms.add(rp.permissions.code);
      }
    }
    setRoleNames([...names]);
    setPermissions(perms);

    const centreRows = (centreRes.data ?? []) as unknown as CentreRow[];
    setCentres(
      centreRows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        zoneName: c.zones?.name ?? null,
      })),
    );

    // Authenticated but assigned nothing: a real and distinct state. Deny-by-default means a valid
    // login can legitimately reach zero centres, and saying so beats an empty dashboard.
    setStatus(centreRows.length === 0 && perms.size === 0 ? 'no_access' : 'signed_in');
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) void loadAccess();
      else setStatus('signed_out');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) {
        setStatus('loading');
        void loadAccess();
      } else {
        setProfile(null);
        setRoleNames([]);
        setPermissions(new Set());
        setCentres([]);
        setStatus('signed_out');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadAccess]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: supabaseConfigError };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Deliberately not distinguishing "no such user" from "wrong password": that difference lets an
    // attacker enumerate valid staff email addresses.
    if (error) {
      return {
        error:
          error.message.toLowerCase().includes('invalid')
            ? 'Those details were not recognised.'
            : error.message,
      };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? session?.user.email ?? null,
      jobTitle: profile?.job_title ?? null,
      roleNames,
      permissions,
      centres,
      loadError,
      configError: supabaseConfigError,
      signIn,
      signOut,
      can: (p: string) => permissions.has(p),
    }),
    [status, session, profile, roleNames, permissions, centres, loadError, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
