import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as data from '../../services/data-access.js';
import { restrictedVisibility, type Permission, type RestrictedArea } from './permissions.js';

/**
 * Session, profile and permission state.
 *
 * The permission set here is for **rendering only** — deciding which controls to show. It is never
 * the security boundary. Every read and write is independently evaluated by RLS against the user's
 * assignments, so a tampered client can hide nothing and unlock nothing. Hiding a control is a
 * courtesy to the user; the database is the control.
 *
 * All Supabase access goes through the service layer. There are no queries in this file.
 */

export interface AccessibleCentre {
  id: string;
  name: string;
  slug: string;
  zoneName: string | null;
}

export interface AuthState {
  status: 'loading' | 'signed_out' | 'signed_in' | 'no_access' | 'unconfigured' | 'error';
  session: Session | null;
  displayName: string | null;
  email: string | null;
  jobTitle: string | null;
  roleNames: readonly string[];
  roleCodes: readonly string[];
  permissions: ReadonlySet<Permission>;
  centres: readonly AccessibleCentre[];
  loadError: string | null;
  configError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Typed: a mistyped code is a compile error rather than a silently missing control. */
  can: (permission: Permission) => boolean;
  /** 'hidden' | 'indicator' | 'full' for safeguarding, risk or medical. */
  visibilityOf: (area: RestrictedArea) => 'hidden' | 'indicator' | 'full';
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configError = data.configError();
  const [status, setStatus] = useState<AuthState['status']>(
    configError ? 'unconfigured' : 'loading',
  );
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<data.ProfileRow | null>(null);
  const [roleNames, setRoleNames] = useState<readonly string[]>([]);
  const [roleCodes, setRoleCodes] = useState<readonly string[]>([]);
  const [permissions, setPermissions] = useState<ReadonlySet<Permission>>(new Set());
  const [centres, setCentres] = useState<readonly AccessibleCentre[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAccess = useCallback(async () => {
    try {
      const [profileRow, assignments, centreRows] = await Promise.all([
        data.identity.profile(),
        data.identity.accessAssignments(),
        data.centres.listAccessible(),
      ]);

      setProfile(profileRow);

      const perms = new Set<Permission>();
      const names = new Set<string>();
      const codes = new Set<string>();
      for (const a of assignments) {
        if (!a.roles) continue;
        names.add(a.roles.name);
        codes.add(a.roles.code);
        for (const rp of a.roles.role_permissions ?? []) {
          if (rp.permissions?.code) perms.add(rp.permissions.code as Permission);
        }
      }
      setRoleNames([...names]);
      setRoleCodes([...codes]);
      setPermissions(perms);

      setCentres(
        centreRows.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          zoneName: c.zones?.name ?? null,
        })),
      );

      setLoadError(null);
      // Authenticated but assigned nothing is a real and distinct state. Deny-by-default means a
      // valid login can legitimately reach zero centres, and saying so beats an empty dashboard.
      setStatus(centreRows.length === 0 && perms.size === 0 ? 'no_access' : 'signed_in');
    } catch (err) {
      // Surfaced, never degraded into an empty result. A permission query that silently returns
      // nothing is indistinguishable from a user who genuinely has none, and quietly showing
      // someone less than they are entitled to is its own kind of wrong.
      setLoadError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!data.isConfigured()) return;
    let cancelled = false;

    void data.auth.getSession().then(({ data: d }) => {
      if (cancelled) return;
      setSession(d.session);
      if (d.session) void loadAccess();
      else setStatus('signed_out');
    });

    const { data: sub } = data.auth.onAuthStateChange(async (event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setRoleNames([]);
        setRoleCodes([]);
        setPermissions(new Set());
        setCentres([]);
        setStatus('signed_out');
        return;
      }
      // Do NOT call setStatus('loading') here. Any auth event — SIGNED_IN, TOKEN_REFRESHED,
      // INITIAL_SESSION — can fire when the tab regains focus. Putting the app into 'loading'
      // unmounts BrowserRouter and every route inside it, which destroys all in-progress form
      // state (e.g. a half-filled admit-client form). The initial loading gate is handled by
      // useState's initial value ('loading') so it only applies on first page load, not on
      // every subsequent auth ping. Permissions are refreshed silently in the background.
      if (event === 'TOKEN_REFRESHED') return;
      await loadAccess();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadAccess]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await data.auth.signInWithPassword(email, password);
      // Deliberately not distinguishing "no such user" from "wrong password": that difference lets
      // an attacker enumerate staff email addresses.
      if (error) {
        return {
          error: error.message.toLowerCase().includes('invalid')
            ? 'Those details were not recognised.'
            : error.message,
        };
      }
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Sign-in failed.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (data.isConfigured()) await data.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(() => {
    const has = (p: Permission) => permissions.has(p);
    return {
      status,
      session,
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? session?.user.email ?? null,
      jobTitle: profile?.job_title ?? null,
      roleNames,
      roleCodes,
      permissions,
      centres,
      loadError,
      configError,
      signIn,
      signOut,
      can: has,
      visibilityOf: (area) => restrictedVisibility({ has }, area),
    };
  }, [
    status,
    session,
    profile,
    roleNames,
    roleCodes,
    permissions,
    centres,
    loadError,
    configError,
    signIn,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
