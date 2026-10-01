import { Activity, Building2, ChevronDown, Copy, Eye, EyeOff, HeartPulse, Shield, ShieldPlus, Trash2, UserPlus, Wrench } from 'lucide-react';
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
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
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
 * Real account creation (`AddTeamMemberModal` below) goes through the `invite-user` Edge Function
 * (migration 0031) — the one place in this project that ever touches the `service_role` key, which
 * must never reach the browser. It creates the Supabase Auth login with a real password (admin-typed
 * or auto-generated, shown back exactly once) and grants the chosen role in the same step —
 * `GrantAccessForm` further down remains for anything that one-step flow doesn't cover: an existing
 * login, multiple centres, a time limit, or read-only access.
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

  // The toggle looks broken if there's nothing for it to reveal — show a plain, non-interactive
  // note instead of a button that flips its own label but visibly changes nothing.
  const hasEndedAssignments = useMemo(
    () => assignments.some((a) => a.ends_at !== null && new Date(a.ends_at).getTime() <= Date.now()),
    [assignments],
  );

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
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      <PageHeader
        title="User Management"
        description="Everyone with access, their role and scope, at a glance below. Add a team member to create their sign-in and grant their role in one step; the advanced form further down handles anything beyond the common case — multiple centres, a time-limited grant, or extra access for someone who already has a login."
      />

      <RoleCards />

      <AddTeamMemberModal
        roles={roles}
        organisations={organisations}
        centres={centres}
        onAdded={reload}
      />

      <GrantAccessForm
        users={users}
        roles={roles}
        organisations={organisations}
        centres={centres}
        permissionCodesByRoleId={permissionCodesByRoleId}
        onGranted={reload}
      />

      <Panel
        title="Users"
        subtitle={`${users.length} shown`}
        className="mt-6"
        titleExtra={!hasEndedAssignments ? (
          <span className="text-[11.5px] text-[var(--color-ink-muted)]">No ended assignments</span>
        ) : undefined}
        {...(hasEndedAssignments ? {
          action: {
            label: showEnded ? 'Hide ended assignments' : 'Show ended assignments',
            onClick: () => setShowEnded((v) => !v),
          },
        } : {})}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                <th className="w-[220px] py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Access</th>
                <th className="w-[130px] py-2 pr-3 text-right">Status</th>
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

/**
 * Plain-English reference for the 5 roles the Role picker offers, keyed by the stable `roles.code`
 * — not generated from `permissions`/`role_permissions`: the live data would list dozens of raw
 * permission codes, which is exactly the unreadable thing this exists to translate away from. Shared
 * between the always-visible cards below and the role picker inside AddTeamMemberModal, so the two
 * never describe a role differently.
 *
 * Deliberately named after the job, not an abstract "Level N" — the migration that once proposed that
 * framing (0062) was written but never actually applied to this database, so these are also just the
 * first real names these roles have ever had in production. Order here is display order: Super Admin,
 * Operations Manager, Centre Manager, Clinical Staff, View Only.
 */
const ROLE_CARD_DATA: Record<string, {
  icon: typeof Shield;
  tone: 'alert' | 'good' | 'accent' | 'neutral';
  summary: string;
  covers: string[];
  excludes?: string[];
}> = {
  platform_admin: {
    icon: Shield,
    tone: 'alert',
    summary: 'Full system access — every centre, every permission. For the operations team.',
    covers: [
      'Every permission in the system, at every centre',
      'Managing other staff’s access (adding, granting, revoking)',
      'Creating and configuring centres',
    ],
  },
  operations_manager: {
    icon: Activity,
    tone: 'alert',
    summary: 'Oversight and approval across every centre — no hands-on clinical work.',
    covers: [
      'Signing off discharges and stay extensions, group-wide',
      'Reports, audit history, and operational detail at every centre',
      'See client details and that a risk/safeguarding flag exists (not the written detail)',
    ],
    excludes: [
      'Managing other staff’s access',
      'Creating or configuring centres',
      'Admitting clients, room/bed management, or any clinical recording',
    ],
  },
  centre_manager: {
    icon: Building2,
    tone: 'good',
    summary: 'Full control of one centre — admissions through discharge, all of it.',
    covers: [
      'Admissions, discharge, stay extensions',
      'Room/bed management, all clinical recording (treatment, medical, risk, safeguarding)',
      'Client identity editing, photos, tasks, family contact, reports, audit history',
    ],
    excludes: ['Managing other staff’s access', 'Creating or configuring centres'],
  },
  therapist: {
    icon: HeartPulse,
    tone: 'accent',
    summary: 'Does the clinical work — therapists, support workers, and similar roles.',
    covers: [
      'View and complete assigned tasks',
      'Record treatment sessions and family contact',
      'See client details, photos, and that a risk/safeguarding flag exists (not the written detail)',
    ],
    excludes: [
      'Admitting, discharging, or extending a stay',
      'Room/bed management, editing client identity',
      'Recording or reading risk/safeguarding/medical detail',
    ],
  },
  centre_staff: {
    icon: Wrench,
    tone: 'neutral',
    summary: 'View-only, for maintenance, reception, or other centre staff.',
    covers: [
      'Which beds/rooms are occupied or free, and the task list',
      'Client names and basic facts',
    ],
    excludes: [
      'Any clinical, risk, or safeguarding detail',
      'Completing tasks or recording anything clinical',
      'Admissions, discharge, or room management',
    ],
  },
};

function RoleCards() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {Object.entries(ROLE_CARD_DATA).map(([code, r]) => {
        const isOpen = expanded === code;
        return (
          <div key={code} className="rounded-2xl border bg-card p-3.5 shadow-soft">
            <div className="flex items-center gap-1.5">
              <r.icon className="size-3.5" aria-hidden />
              <Chip label={ROLE_DISPLAY_NAME[code] ?? code} tone={r.tone} />
            </div>
            <p className="mt-2 text-[11.5px] font-medium text-[var(--color-ink)]">{r.summary}</p>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : code)}
              className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--color-ink-muted)] underline decoration-dotted transition hover:text-[var(--color-ink)]"
            >
              <ChevronDown className={`size-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
              {isOpen ? 'Hide details' : 'Show details'}
            </button>
            {isOpen ? (
              <>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-[var(--color-ink-muted)]">
                  {r.covers.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {r.excludes ? (
                  <ul className="mt-2 space-y-1 border-t border-[var(--color-line)] pt-2 text-[11px] text-[var(--color-ink-muted)]">
                    {r.excludes.map((c) => (
                      <li key={c} className="flex gap-1.5">
                        <span aria-hidden="true">&#8722;</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Display name fallback used before migration 0083 has landed — once it has, `roles.name` itself
 * already reads "Super Admin" etc. and this is never reached for these 5 codes. */
const ROLE_DISPLAY_NAME: Record<string, string> = {
  platform_admin: 'Super Admin',
  operations_manager: 'Operations Manager',
  centre_manager: 'Centre Manager',
  therapist: 'Clinical Staff',
  centre_staff: 'View Only',
};

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
      <td className="w-[220px] py-2.5 pr-3">
        <div className="truncate font-medium">{user.display_name}</div>
        <div className="truncate text-[11px] text-[var(--color-ink-muted)]">
          {user.email}
          {user.job_title ? ` · ${user.job_title}` : ''}
        </div>
        {/* Every distinct role this person holds, right under their name — the level at a glance,
            without reading the (possibly several) full assignment cards in the next column. */}
        {assignments.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {[...new Set(assignments.map((a) => rolesById.get(a.role_id)?.name ?? 'Unknown role'))].map((name) => (
              <Chip key={name} label={name} tone="accent" />
            ))}
          </div>
        ) : null}
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
      <td className="w-[130px] py-2.5 pr-3 text-right">
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
  const [showPermissions, setShowPermissions] = useState(false);

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
          submitting one of these. Collapsed by default: the role name above already says what this
          grant does in plain English (see the levels guide) — this is the raw detail underneath it,
          not the thing most people need to read every time. */}
      {permissionCodes.length > 0 ? (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowPermissions((v) => !v)}
            className="text-[10.5px] font-medium text-[var(--color-ink-muted)] underline decoration-dotted transition hover:text-[var(--color-ink)]"
          >
            {showPermissions ? 'Hide permissions' : `Show ${permissionCodes.length} permissions`}
          </button>
          {showPermissions ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {permissionCodes.map((code) => (
                <Chip key={code} label={code} />
              ))}
            </div>
          ) : null}
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

/** 16 characters, no visually-ambiguous glyphs — a client-side suggestion only, for the "Generate"
 * button's convenience. The authoritative password either comes from this (if the admin keeps it) or
 * from the Edge Function's own generator (if the field is left blank) — either way the server is
 * what actually sets it on the account, this is just a starting point the admin can see and edit. */
function suggestPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/**
 * Real account creation, via the `invite-user` Edge Function — see this file's header comment and
 * migration 0031 — combined with a single `GrantAccessForm`-equivalent grant in the same submit, so
 * adding someone is one step instead of two. Deliberately sets a real password directly (an admin
 * either types one or leaves it blank to get one generated) rather than emailing an invite link —
 * see invite-user/index.ts's header comment for why that trade was made. The password is shown back
 * exactly once, in this modal's success state; nothing stores it after that.
 */
function AddTeamMemberModal({
  roles,
  organisations,
  centres,
  onAdded,
}: {
  roles: RoleRow[];
  organisations: OrganisationRow[];
  centres: CentreRow[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [roleCode, setRoleCode] = useState<string>('therapist');
  const [centreId, setCentreId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [reason, setReason] = useState('New team member onboarding');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ displayName: string; password: string; grantError: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const role = roles.find((r) => r.code === roleCode);
  const isOrgWide = roleCode === 'platform_admin';
  const canSubmit =
    displayName.trim() !== '' && email.trim() !== '' && !!role && reason.trim() !== '' &&
    (isOrgWide ? organisations.length > 0 : !!centreId) &&
    (password === '' || password.length >= 8);

  const reset = () => {
    setDisplayName('');
    setEmail('');
    setJobTitle('');
    setRoleCode('therapist');
    setCentreId('');
    setPassword('');
    setShowPassword(false);
    setReason('New team member onboarding');
    setError(null);
    setResult(null);
    setCopied(false);
  };

  const submit = async () => {
    if (!canSubmit || !role) return;
    setBusy(true);
    setError(null);
    try {
      const invited = await userAdmin.invite({
        email: email.trim(),
        displayName: displayName.trim(),
        jobTitle: jobTitle.trim() || undefined,
        password: password.trim() || undefined,
      });

      let grantError: string | null = null;
      try {
        await userAdmin.grant({
          userId: invited.userId,
          roleId: role.id,
          scopeType: isOrgWide ? 'organisation' : 'centre',
          scopeId: isOrgWide ? organisations[0]!.id : centreId,
          reason: reason.trim(),
        });
      } catch (err) {
        // The login exists either way — surface this so the admin knows to grant access manually
        // below (GrantAccessForm) rather than assuming it already happened.
        grantError = err instanceof Error ? err.message : 'Could not grant access.';
      }

      setResult({ displayName: displayName.trim(), password: invited.password, grantError });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-[var(--color-accent-hover)]"
      >
        <UserPlus className="size-3.5" /> Add team member&hellip;
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); reset(); } }}>
        <DialogContent className="max-w-[560px]">
          <DialogTitle className="font-display text-[16px] font-semibold">Add team member</DialogTitle>

          {result ? (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-[var(--color-ink)]">
                {result.displayName}&rsquo;s sign-in has been created.
              </p>
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
                  Temporary password — shown once, share it with them directly:
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="nums flex-1 rounded-md border border-amber-300 bg-card px-2.5 py-1.5 text-[13px] dark:border-amber-800">
                    {result.password}
                  </code>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <Copy className="size-3" /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              {result.grantError ? (
                <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                  Their sign-in was created, but granting access failed: {result.grantError} — use
                  &ldquo;Grant additional access&rdquo; below once you&rsquo;re ready to retry.
                </div>
              ) : null}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setOpen(false); reset(); }}
                  className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Full name *</span>
                  <input autoFocus className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Email address *</span>
                  <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Job title (optional)</span>
                  <input className={inputCls} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </label>
              </div>

              <div>
                <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Role *</span>
                <div className="mt-1 flex flex-col gap-1.5">
                  {Object.entries(ROLE_CARD_DATA).map(([code, r]) => {
                    const selected = roleCode === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setRoleCode(code)}
                        className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition ${
                          selected ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-line)] hover:bg-black/5 dark:hover:bg-white/10'
                        }`}
                      >
                        <r.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          <span className="block text-[12.5px] font-semibold text-[var(--color-ink)]">
                            {ROLE_DISPLAY_NAME[code] ?? code}
                          </span>
                          <span className="block text-[11px] text-[var(--color-ink-muted)]">{r.summary}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!isOrgWide ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Centre *</span>
                  <select className={inputCls} value={centreId} onChange={(e) => setCentreId(e.target.value)}>
                    <option value="">Select a centre…</option>
                    {centres.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-[11px] text-[var(--color-ink-muted)]">
                  Super Admin applies across the whole organisation — no centre to pick.
                </p>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
                  Temporary password (optional — auto-generated if blank)
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`${inputCls} flex-1`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? 'Hide' : 'Show'}
                    className="shrink-0 rounded-md border border-[var(--color-line)] p-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPassword(suggestPassword()); setShowPassword(true); }}
                    className="shrink-0 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Generate
                  </button>
                </div>
                {password && password.length < 8 ? (
                  <span className="text-[10.5px] text-red-600 dark:text-red-400">At least 8 characters.</span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Reason *</span>
                <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>

              {error ? (
                <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-[12px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !canSubmit}
                  onClick={() => void submit()}
                  className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white transition disabled:opacity-40"
                >
                  {busy ? 'Adding…' : 'Add team member'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setOpen(false); reset(); }}
                  className="rounded-lg px-3 py-1.5 text-[12.5px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GrantAccessForm({
  users,
  roles,
  organisations,
  centres,
  permissionCodesByRoleId,
  onGranted,
}: {
  users: UserProfileRow[];
  roles: RoleRow[];
  organisations: OrganisationRow[];
  centres: CentreRow[];
  permissionCodesByRoleId: Map<string, string[]>;
  onGranted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  // 'custom' replaces the old 'zone' scope: rather than being confined to a pre-defined zone
  // grouping, an admin picks exactly which centres a grant should cover. Under the hood this just
  // creates one 'centre'-scoped assignment per centre picked — no schema change needed, since a
  // person having several separate centre grants is already exactly what multi-centre access is.
  const [scopeType, setScopeType] = useState<'organisation' | 'custom' | 'centre'>('centre');
  const [scopeId, setScopeId] = useState('');
  const [customCentreIds, setCustomCentreIds] = useState<string[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeOptions = scopeType === 'organisation' ? organisations : centres;
  const canSubmit =
    !!userId && !!roleId && reason.trim() !== '' &&
    (scopeType === 'custom' ? customCentreIds.length > 0 : !!scopeId);

  const toggleCustomCentre = (id: string) => {
    setCustomCentreIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // End of the chosen day — this is an admin action independent of any one centre's timezone,
      // so a simple calendar-day boundary is the right level of precision, not a zoned instant.
      const endsAtIso = endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : undefined;
      if (scopeType === 'custom') {
        for (const centreId of customCentreIds) {
          await userAdmin.grant({
            userId, roleId, scopeType: 'centre', scopeId: centreId,
            reason: reason.trim(), isReadOnly, endsAt: endsAtIso,
          });
        }
      } else {
        await userAdmin.grant({
          userId, roleId, scopeType, scopeId,
          reason: reason.trim(), isReadOnly, endsAt: endsAtIso,
        });
      }
      setUserId('');
      setRoleId('');
      setScopeId('');
      setCustomCentreIds([]);
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
        <ShieldPlus className="size-3.5" /> Grant additional access&hellip;
      </button>
    );
  }

  return (
    <div className="mt-2.5 rounded-2xl border bg-card p-4 shadow-soft">
      <h3 className="font-display text-[13px] font-semibold">Grant additional access</h3>
      <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
        For someone who already has a sign-in, or a grant &ldquo;Add team member&rdquo; above doesn&rsquo;t
        cover — multiple centres, the whole organisation for a non-Super-Admin role, a time limit, or
        read-only access.
      </p>
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
              setCustomCentreIds([]);
            }}
          >
            <option value="centre">One centre</option>
            <option value="custom">Custom (multiple centres)</option>
            <option value="organisation">The whole organisation</option>
          </select>
        </label>
        {scopeType === 'custom' ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
              Centres ({customCentreIds.length} selected)
            </span>
            <div className="max-h-32 overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5">
              {centres.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[12.5px] hover:bg-black/5 dark:hover:bg-white/10">
                  <input
                    type="checkbox"
                    checked={customCentreIds.includes(c.id)}
                    onChange={() => toggleCustomCentre(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
              {scopeType === 'organisation' ? 'Organisation' : 'Centre'}
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
        )}
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
