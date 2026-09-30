import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  userAdmin,
  type AccessAssignmentRow,
  type PermissionRow,
  type RolePermissionRow,
  type RoleRow,
  type UserProfileRow,
} from '../../services/data-access.js';
import { Chip, Panel } from '../../components/ui.tsx';

/**
 * A read-only staff directory — who has access and what they can do — pulled from the same real
 * `user_profiles` / `user_access_assignments` data as the System access tab's "Users" table, just
 * presented as a plain directory instead of buried under the invite/grant forms. Organisation-wide
 * like that tab, not filtered to one centre: a zone- or organisation-scoped grant reaches every
 * centre in it, and resolving that containment correctly needs more than this list's own data — the
 * System access tab already shows exactly which scope each grant covers.
 *
 * No actions here on purpose. Granting, revoking and inviting all stay on System access, the one
 * place those already work correctly — this screen is for seeing the roster at a glance, not a
 * second place that could drift from it.
 */
export function StaffDirectory() {
  const { can } = useAuth();
  const canView = can('administration.manage_users');

  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionRow[]>([]);
  const [assignments, setAssignments] = useState<AccessAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      userAdmin.listUsers(),
      userAdmin.listRoles(),
      userAdmin.listPermissions(),
      userAdmin.listRolePermissions(),
      userAdmin.listAssignments(),
    ])
      .then(([u, r, p, rp, a]) => {
        if (cancelled) return;
        setUsers(u);
        setRoles(r);
        setPermissions(p);
        setRolePermissions(rp);
        setAssignments(a);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView]);

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const permissionCodesByRoleId = useMemo(() => {
    const codesById = new Map(permissions.map((p) => [p.id, p.code]));
    const m = new Map<string, string[]>();
    for (const rp of rolePermissions) {
      const code = codesById.get(rp.permission_id);
      if (!code) continue;
      const list = m.get(rp.role_id) ?? [];
      list.push(code);
      m.set(rp.role_id, list);
    }
    return m;
  }, [rolePermissions, permissions]);

  const activeAssignmentsByUser = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, AccessAssignmentRow[]>();
    for (const a of assignments) {
      if (a.ends_at !== null && new Date(a.ends_at).getTime() <= now) continue;
      const list = m.get(a.user_id) ?? [];
      list.push(a);
      m.set(a.user_id, list);
    }
    return m;
  }, [assignments]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view staff and permissions.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading staff…</div>;
  }

  if (loadError) {
    return (
      <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not load this screen: {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[860px] px-5 py-8">
      <Panel title="Staff & permissions" subtitle={`${users.length} across the organisation`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Role &amp; scope</th>
                <th className="py-2 pr-3">Permissions</th>
                <th className="py-2 pr-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const userAssignments = activeAssignmentsByUser.get(u.id) ?? [];
                const permCodes = [
                  ...new Set(userAssignments.flatMap((a) => permissionCodesByRoleId.get(a.role_id) ?? [])),
                ];
                return (
                  <tr key={u.id} className="border-b border-[var(--color-line)] align-top last:border-b-0">
                    <td className="py-2.5 pr-3">
                      <div className="truncate font-medium">{u.display_name}</div>
                      <div className="truncate text-[11px] text-[var(--color-ink-muted)]">
                        {u.email}
                        {u.job_title ? ` · ${u.job_title}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {userAssignments.length === 0 ? (
                        <span className="text-[var(--color-ink-muted)]">No access assigned.</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {userAssignments.map((a) => (
                            <Chip
                              key={a.id}
                              label={`${rolesById.get(a.role_id)?.name ?? 'Unknown role'}${a.is_read_only ? ' (read-only)' : ''}`}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {permCodes.length === 0 ? (
                        <span className="text-[var(--color-ink-muted)]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {permCodes.map((code) => (
                            <Chip key={code} label={code} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <Chip label={u.is_active ? 'Active' : 'Deactivated'} tone={u.is_active ? 'good' : 'warn'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <span className="mt-0.5 text-[var(--color-ink-muted)]">🔒</span>
        <p className="text-[11.5px] text-[var(--color-ink-muted)]">
          This is a read-only roster. To invite someone new, grant access, or revoke it, use the{' '}
          <strong>System access</strong> tab.
        </p>
      </div>
    </div>
  );
}
