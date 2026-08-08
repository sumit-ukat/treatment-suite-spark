import { MailPlus, ShieldPlus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  centres as centresService,
  userAdmin,
  type AccessAssignmentRow,
  type CentreRow,
  type OrganisationRow,
  type PermissionRow,
  type RolePermissionRow,
  type RoleRow,
  type UserProfileRow,
  type ZoneRow,
} from '../../services/data-access.js';
import { Chip, Panel } from '../../components/ui.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import { formatDate } from '../../lib/format.js';

/**
 * Users & roles — the first UI for `user_access_assignments`, which every permission check in this
 * system depends on. Until now every row in it, for every fictional test user across this project's
 * whole history, was created by hand with a direct SQL insert.
 *
 * Deliberately organisation-wide, not scoped to whichever centre the sidebar happens to be showing:
 * a person's access can span an organisation, a zone, or one centre, and "which centre did I navigate
 * through to get here" has no bearing on that. This screen lives under the same "Administration" nav
 * item as Rooms & Beds because both are administrative concerns, not because either is centre-scoped
 * the same way.
 *
 * Real account creation (`InviteUserForm` below) goes through the `invite-user` Edge Function
 * (migration 0031) — the one place in this project that ever touches the `service_role` key, which
 * must never reach the browser. It creates the Supabase Auth login and sends an invite email; the new
 * person sets their own password themselves, no admin ever sees or sets one. It grants no access on
 * its own — granting is `GrantAccessForm` below, a deliberate separate step.
 *
 * Also deliberately absent: any way to create a new role or permission. `roles`/`permissions`/
 * `role_permissions` have no write policy at all (migration 0030) — they are a fixed, migration-seeded
 * catalog. This screen only ever assigns an EXISTING role to a user.
 */
export function UsersAndRoles() {
  const { can } = useAuth();
  const canManage = can('administration.manage_users');

  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionRow[]>([]);
  const [assignments, setAssignments] = useState<AccessAssignmentRow[]>([]);
  const [organisations, setOrganisations] = useState<OrganisationRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [centres, setCentres] = useState<CentreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [showEnded, setShowEnded] = useState(false);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      userAdmin.listUsers(),
      userAdmin.listRoles(),
      userAdmin.listPermissions(),
      userAdmin.listRolePermissions(),
      userAdmin.listAssignments(),
      userAdmin.listOrganisations(),
      userAdmin.listZones(),
      centresService.listAccessible(),
    ])
      .then(([u, r, p, rp, a, org, z, c]) => {
        if (cancelled) return;
        setUsers(u);
        setRoles(r);
        setPermissions(p);
        setRolePermissions(rp);
        setAssignments(a);
        setOrganisations(org);
        setZones(z);
        setCentres(c);
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
  }, [canManage, reloadToken]);

  const reload = () => setReloadToken((t) => t + 1);

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const permissionsById = useMemo(() => new Map(permissions.map((p) => [p.id, p])), [permissions]);
  const permissionCodesByRoleId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const rp of rolePermissions) {
      const code = permissionsById.get(rp.permission_id)?.code;
      if (!code) continue;
      const list = m.get(rp.role_id) ?? [];
      list.push(code);
      m.set(rp.role_id, list);
    }
    return m;
  }, [rolePermissions, permissionsById]);
  const organisationsById = useMemo(() => new Map(organisations.map((o) => [o.id, o])), [organisations]);
  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const centresById = useMemo(() => new Map(centres.map((c) => [c.id, c])), [centres]);

  const scopeLabel = (a: AccessAssignmentRow): string => {
    if (a.scope_type === 'organisation') return organisationsById.get(a.organisation_id ?? '')?.name ?? 'Organisation';
    if (a.scope_type === 'zone') return `${zonesById.get(a.zone_id ?? '')?.name ?? 'Zone'} (zone)`;
    return centresById.get(a.centre_id ?? '')?.name ?? 'Centre';
  };

  const assignmentsByUser = useMemo(() => {
    const now = Date.now();
    const m = new Map<string, AccessAssignmentRow[]>();
    for (const a of assignments) {
      const isEnded = a.ends_at !== null && new Date(a.ends_at).getTime() <= now;
      if (isEnded && !showEnded) continue;
      const list = m.get(a.user_id) ?? [];
      list.push(a);
      m.set(a.user_id, list);
    }
    return m;
  }, [assignments, showEnded]);

  if (!canManage) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to manage users and roles.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading users and roles…</div>;
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
      <PageHeader
        title="Users & roles"
        description="Invite a new person to create their sign-in, then grant them a role. Access can be granted at the whole organisation, a zone, or one centre, independent of which centre you navigated through to reach this page."
      />

      <InviteUserForm onInvited={reload} />

      <GrantAccessForm
        users={users}
        roles={roles}
        organisations={organisations}
        zones={zones}
        centres={centres}
        permissionCodesByRoleId={permissionCodesByRoleId}
        onGranted={reload}
      />

      <Panel
        title="Users"
        subtitle={`${users.length} shown`}
        className="mt-6"
        action={{
          label: showEnded ? 'Hide ended assignments' : 'Show ended assignments',
          onClick: () => setShowEnded((v) => !v),
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Access</th>
                <th className="py-2 pr-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  assignments={assignmentsByUser.get(u.id) ?? []}
                  rolesById={rolesById}
                  permissionCodesByRoleId={permissionCodesByRoleId}
                  scopeLabel={scopeLabel}
                  onChanged={reload}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function UserRow({
  user,
  assignments,
  rolesById,
  permissionCodesByRoleId,
  scopeLabel,
  onChanged,
}: {
  user: UserProfileRow;
  assignments: AccessAssignmentRow[];
  rolesById: Map<string, RoleRow>;
  permissionCodesByRoleId: Map<string, string[]>;
  scopeLabel: (a: AccessAssignmentRow) => string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleActive = async () => {
    setBusy(true);
    setError(null);
    try {
      await userAdmin.setActive(user.id, !user.is_active);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-[var(--color-line)] align-top last:border-b-0">
      <td className="py-2.5 pr-3">
        <div className="truncate font-medium">{user.display_name}</div>
        <div className="truncate text-[11px] text-[var(--color-ink-muted)]">
          {user.email}
          {user.job_title ? ` · ${user.job_title}` : ''}
        </div>
      </td>
      <td className="py-2.5 pr-3">
        {assignments.length === 0 ? (
          <span className="text-[var(--color-ink-muted)]">No access assigned.</span>
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map((a) => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                role={rolesById.get(a.role_id)}
                permissionCodes={permissionCodesByRoleId.get(a.role_id) ?? []}
                scopeLabel={scopeLabel}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right">
        <div className="flex flex-col items-end gap-1.5">
          <Chip label={user.is_active ? 'Active' : 'Deactivated'} tone={user.is_active ? 'good' : 'warn'} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleActive()}
            className="rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            {user.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
          {error ? <p className="text-[10.5px] text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      </td>
    </tr>
  );
}

function AssignmentRow({
  assignment: a,
  role,
  permissionCodes,
  scopeLabel,
  onChanged,
}: {
  assignment: AccessAssignmentRow;
  role: RoleRow | undefined;
  permissionCodes: string[];
  scopeLabel: (a: AccessAssignmentRow) => string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'reason'>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEnded = a.ends_at !== null && new Date(a.ends_at).getTime() <= Date.now();

  const revoke = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await userAdmin.revoke(a.id, reason);
      setMode('idle');
      setReason('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-md border border-[var(--color-line)] px-2.5 py-1.5 ${isEnded ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">
          <span className="font-medium">{role?.name ?? 'Unknown role'}</span>
          <span className="text-[var(--color-ink-muted)]"> &middot; {scopeLabel(a)}</span>
          {a.is_read_only ? <span className="ml-1"><Chip label="Read-only" /></span> : null}
          {isEnded ? <span className="ml-1"><Chip label="Ended" /></span> : null}
        </span>
        {!isEnded && mode === 'idle' ? (
          <button
            type="button"
            onClick={() => setMode('reason')}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <Trash2 className="size-3" /> Revoke
          </button>
        ) : null}
      </div>

      {/* Real permissions this specific grant carries — the same union GrantAccessForm previews before
          submitting one of these, shown again here since a role's permission set is what this
          assignment actually does, not just its name. */}
      {permissionCodes.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {permissionCodes.map((code) => (
            <Chip key={code} label={code} />
          ))}
        </div>
      ) : null}

      <div className="nums mt-1.5 text-[10.5px] text-[var(--color-ink-muted)]">
        Since {formatDate(new Date(a.starts_at))}
        {a.ends_at ? ` · ended ${formatDate(new Date(a.ends_at))}` : ''}
        {a.reason ? ` · ${a.reason}` : ''}
      </div>

      {mode === 'reason' ? (
        <div className="mt-1.5 border-t border-[var(--color-line)] pt-1.5">
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">Why is this being revoked?</label>
          <textarea
            autoFocus
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-0.5 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => void revoke()}
              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Revoke'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode('idle');
                setReason('');
                setError(null);
              }}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

const inputCls =
  'rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] focus:border-[var(--color-accent)] focus:outline-none';

/**
 * Real account creation, via the `invite-user` Edge Function — see this file's header comment and
 * migration 0031. No password field anywhere here: the new person sets their own via the emailed
 * invite link. This form grants no access; the person appears below with "No access assigned" until
 * `GrantAccessForm` is used separately.
 */
function InviteUserForm({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const canSubmit = email.trim() && displayName.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await userAdmin.invite({
        email: email.trim(),
        displayName: displayName.trim(),
        jobTitle: jobTitle.trim() || undefined,
      });
      setDone(`Invited ${displayName.trim()} — they will get an email to set their password.`);
      setEmail('');
      setDisplayName('');
      setJobTitle('');
      setOpen(false);
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-[var(--color-accent-hover)]"
        >
          <MailPlus className="size-3.5" /> Invite a new user&hellip;
        </button>
        {done ? <span className="text-[11.5px] text-[var(--color-ink-muted)]">{done}</span> : null}
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border bg-card p-4 shadow-soft">
      <h3 className="font-display text-[13px] font-semibold">Invite a new user</h3>
      <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
        Creates their sign-in and sends them an email to set their own password. Grants no access —
        do that separately below once their account exists.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Email</span>
          <input
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Display name</span>
          <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Job title (optional)</span>
          <input className={inputCls} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </label>
      </div>

      {error ? (
        <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() => void submit()}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white transition disabled:opacity-40"
        >
          {busy ? 'Inviting…' : 'Send invite'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-[12.5px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function GrantAccessForm({
  users,
  roles,
  organisations,
  zones,
  centres,
  permissionCodesByRoleId,
  onGranted,
}: {
  users: UserProfileRow[];
  roles: RoleRow[];
  organisations: OrganisationRow[];
  zones: ZoneRow[];
  centres: CentreRow[];
  permissionCodesByRoleId: Map<string, string[]>;
  onGranted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [scopeType, setScopeType] = useState<'organisation' | 'zone' | 'centre'>('centre');
  const [scopeId, setScopeId] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeOptions = scopeType === 'organisation' ? organisations : scopeType === 'zone' ? zones : centres;
  const canSubmit = userId && roleId && scopeId && reason.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await userAdmin.grant({
        userId,
        roleId,
        scopeType,
        scopeId,
        reason: reason.trim(),
        isReadOnly,
        // End of the chosen day — this is an admin action independent of any one centre's timezone,
        // so a simple calendar-day boundary is the right level of precision, not a zoned instant.
        endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : undefined,
      });
      setUserId('');
      setRoleId('');
      setScopeId('');
      setIsReadOnly(false);
      setEndsAt('');
      setReason('');
      setOpen(false);
      onGranted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
      >
        <ShieldPlus className="size-3.5" /> Grant access&hellip;
      </button>
    );
  }

  return (
    <div className="mt-2.5 rounded-2xl border bg-card p-4 shadow-soft">
      <h3 className="font-display text-[13px] font-semibold">Grant access</h3>
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">User</span>
          <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Role</span>
          <select className={inputCls} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Select a role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Scope</span>
          <select
            className={inputCls}
            value={scopeType}
            onChange={(e) => {
              setScopeType(e.target.value as typeof scopeType);
              setScopeId('');
            }}
          >
            <option value="centre">One centre</option>
            <option value="zone">A zone</option>
            <option value="organisation">The whole organisation</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
            {scopeType === 'organisation' ? 'Organisation' : scopeType === 'zone' ? 'Zone' : 'Centre'}
          </span>
          <select className={inputCls} value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            <option value="">Select…</option>
            {scopeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {roleId && permissionCodesByRoleId.get(roleId)?.length ? (
        <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--color-ink-muted)]">
          Grants: {permissionCodesByRoleId.get(roleId)!.join(', ')}
        </p>
      ) : null}

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={isReadOnly} onChange={(e) => setIsReadOnly(e.target.checked)} />
          Read-only (can see, cannot act)
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Ends (optional)</span>
          <input type="date" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
      </div>

      <label className="mt-2.5 flex flex-col gap-1">
        <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Reason</span>
        <textarea
          rows={2}
          className={`${inputCls} resize-none`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>

      {error ? (
        <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() => void submit()}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white transition disabled:opacity-40"
        >
          {busy ? 'Granting…' : 'Grant access'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-[12.5px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
