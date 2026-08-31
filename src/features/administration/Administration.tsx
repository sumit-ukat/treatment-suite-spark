import { useState } from 'react';
import { ChevronDown, MailPlus, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { RoomsAndBedsAdmin } from './RoomsAndBeds.tsx';
import { UsersAndRoles } from './UsersAndRoles.tsx';
import { PageHeader } from '../../components/metric-card.tsx';

type StaffRole =
  | 'Centre Manager'
  | 'Office Manager'
  | 'Nurse'
  | 'Therapist'
  | 'Support Worker'
  | 'Night Support Worker'
  | 'Ops Manager'
  | 'Master / Dev';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  position: string;
  permissions: string[];
  lastActive: string;
  initials: string;
}

interface PendingInvite {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  invitedAt: string;
}

const ALL_PERMISSIONS = ['View board', 'Admit clients', 'Approve discharge', 'Complete actions', 'Manage staff', 'View audit'];

const ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  'Centre Manager':       ALL_PERMISSIONS,
  'Office Manager':       ['View board', 'Admit clients', 'View audit'],
  'Nurse':                ['View board', 'Complete actions'],
  'Therapist':            ['View board', 'Complete actions'],
  'Support Worker':       ['View board', 'Complete actions'],
  'Night Support Worker': ['View board', 'Complete actions'],
  'Ops Manager':          ALL_PERMISSIONS,
  'Master / Dev':         ALL_PERMISSIONS,
};

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function staff(id: string, name: string, email: string, role: StaffRole, position: string, lastActive: string): StaffMember {
  return { id, name, email, role, position, initials: initials(name), permissions: ROLE_PERMISSIONS[role], lastActive };
}

const STAFF: StaffMember[] = [
  staff('1',  'Jonnny Beggache',         'jonnny.beggache@ukat.co.uk',         'Centre Manager',       'Centre Manager',          '27 Aug · 09:00'),
  staff('2',  'Rebecca Roberts',          'rebecca.roberts@ukat.co.uk',          'Office Manager',       'Office Manager',          '27 Aug · 08:30'),
  staff('3',  'Adrian Allan',             'adrian.allan@ukat.co.uk',             'Nurse',                'Registered Nurse',        '26 Aug · 22:00'),
  staff('4',  'Barbora Mason',            'barbora.mason@ukat.co.uk',            'Therapist',            'Lead Counsellor',         '27 Aug · 08:00'),
  staff('5',  'Gary Davidson',            'gary.davidson@ukat.co.uk',            'Therapist',            'Counsellor',              '26 Aug · 17:00'),
  staff('6',  'Fabio Randolfi',           'fabio.randolfi@ukat.co.uk',           'Therapist',            'Counsellor',              '25 Aug · 16:00'),
  staff('7',  'Michael Dann',             'michael.dann@ukat.co.uk',             'Therapist',            'Counsellor – Trainee',    '24 Aug · 14:00'),
  staff('8',  'Soraya McLellan',          'soraya.mclellan@ukat.co.uk',          'Therapist',            'Counsellor',              '26 Aug · 09:00'),
  staff('9',  'Kim Mclaren',              'kim.mclaren@ukat.co.uk',              'Therapist',            'Weekend Counsellor',      '24 Aug · 18:00'),
  staff('10', 'Carl Bossley',             'carl.bossley@ukat.co.uk',             'Support Worker',       'Support Worker',          '27 Aug · 07:00'),
  staff('11', 'Christopher Howard',       'christopher.howard@ukat.co.uk',       'Support Worker',       'Support Worker',          '27 Aug · 07:00'),
  staff('12', 'Sam David',               'sam.david@ukat.co.uk',                'Support Worker',       'Support Worker',          '26 Aug · 19:00'),
  staff('13', 'Christopher Brooks',       'christopher.brooks@ukat.co.uk',       'Support Worker',       'Senior Support Worker',   '26 Aug · 07:00'),
  staff('14', 'Kosiscochukwu Madueke',   'kosiscochukwu.madueke@ukat.co.uk',   'Night Support Worker', 'Night Support Worker',    '27 Aug · 06:00'),
  staff('15', 'Kenneth Ogbu',             'kenneth.ogbu@ukat.co.uk',             'Night Support Worker', 'Night Support Worker',    '26 Aug · 06:00'),
  staff('16', 'Samantha Gilbert',         'samantha.gilbert@ukat.co.uk',         'Support Worker',       'Bank Support Worker',     '20 Aug · 12:00'),
  staff('17', 'Jana Harvanova',           'jana.harvanova@ukat.co.uk',           'Support Worker',       'Bank Support Worker',     '18 Aug · 10:00'),
  staff('18', 'John Portman',             'john.portman@ukat.co.uk',             'Support Worker',       'Bank Support Worker',     '15 Aug · 09:00'),
  staff('19', 'Kim Wilmot',              'kim.wilmot@ukat.co.uk',               'Support Worker',       'Bank Support Worker',     '22 Aug · 14:00'),
];

const PENDING: PendingInvite[] = [];

// ─── Permission chip colour ───────────────────────────────────────────────────

const PERM_STYLE: Record<string, string> = {
  'View board':        'bg-[var(--color-surface)] text-[var(--color-ink-muted)]',
  'Admit clients':     'bg-sky-50    text-sky-700    dark:bg-sky-950/60    dark:text-sky-300',
  'Approve discharge': 'bg-amber-50  text-amber-700  dark:bg-amber-950/60  dark:text-amber-300',
  'Complete actions':  'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'Manage staff':      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'View audit':        'bg-[var(--color-surface)] text-[var(--color-ink-muted)]',
};

function PermChip({ label }: { label: string }) {
  const cls = PERM_STYLE[label] ?? 'bg-[var(--color-surface)] text-[var(--color-ink-muted)]';
  return (
    <span className={`rounded-md border border-black/[0.06] px-1.5 py-0.5 text-[10.5px] font-medium dark:border-white/10 ${cls}`}>
      {label}
    </span>
  );
}

// ─── Staff row ────────────────────────────────────────────────────────────────

function StaffRow({ member: m }: { member: StaffMember }) {
  return (
    <tr className="group border-b border-[var(--color-line)] align-middle last:border-b-0 hover:bg-[var(--color-accent-soft)]/40 transition-colors">
      {/* Name */}
      <td className="py-3 pr-4 pl-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[11px] font-bold text-[var(--color-accent)]">
            {m.initials}
          </div>
          <div>
            <p className="text-[13px] font-medium text-[var(--color-ink)]">{m.name}</p>
            <p className="text-[11px] text-[var(--color-ink-muted)]">{m.email}</p>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="py-3 pr-4">
        <div className="inline-flex cursor-default items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] font-medium">
          {m.role}
          <ChevronDown className="size-3 text-[var(--color-ink-muted)]" />
        </div>
        {m.position !== m.role ? (
          <p className="mt-0.5 text-[10.5px] text-[var(--color-ink-muted)]">{m.position}</p>
        ) : null}
      </td>

      {/* Permissions */}
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1">
          {m.permissions.map((p) => (
            <PermChip key={p} label={p} />
          ))}
        </div>
      </td>

      {/* Last active */}
      <td className="py-3 pr-4 text-right">
        <span className="nums text-[11.5px] text-[var(--color-ink-muted)]">{m.lastActive}</span>
      </td>
    </tr>
  );
}

// ─── Staff & permissions view ─────────────────────────────────────────────────

function StaffView({ centreName, onInvite }: { centreName: string; onInvite: () => void }) {
  return (
    <div className="space-y-6 px-5 py-6">
      <PageHeader
        eyebrow={centreName}
        title="Administration"
        description={`${STAFF.length} active staff · ${PENDING.length} pending invite`}
        actions={
          <button
            type="button"
            onClick={onInvite}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            <UserPlus className="size-3.5" />
            Invite staff
          </button>
        }
      />

      {/* Staff & permissions table */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-card">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
          <span className="text-[13px] font-semibold">Staff &amp; permissions</span>
          <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
            {STAFF.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                {['Name', 'Role', 'Permissions', 'Last active'].map((h) => (
                  <th
                    key={h}
                    className={`py-2 pr-4 text-left text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase first:pl-4 ${h === 'Last active' ? 'text-right' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAFF.map((m) => (
                <StaffRow key={m.id} member={m} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending invites */}
      {PENDING.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-card">
          <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
            <MailPlus className="size-3.5 text-[var(--color-ink-muted)]" />
            <span className="text-[13px] font-semibold">Pending invites</span>
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              {PENDING.length}
            </span>
          </div>

          <ul className="divide-y divide-[var(--color-line)]">
            {PENDING.map((inv) => (
              <li key={inv.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {inv.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{inv.name}</span>
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      ⚑ Invite pending
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-ink-muted)]">
                    {inv.email} · invited as {inv.role} · {inv.invitedAt}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <RotateCcw className="size-3" />
                    Resend
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11.5px] font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="size-3" />
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Audit note */}
      <div className="flex items-start gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <span className="mt-0.5 text-[var(--color-ink-muted)]">🔒</span>
        <p className="text-[11.5px] text-[var(--color-ink-muted)]">
          Role and permission changes are written to audit history against your account immediately.
          To invite a new user or manage system access, use the <strong>System access</strong> tab.
        </p>
      </div>
    </div>
  );
}

// ─── Root Administration component ───────────────────────────────────────────

export function Administration({ centre }: { centre: AccessibleCentre }) {
  const [tab, setTab] = useState<'staff' | 'rooms' | 'system'>('system');

  const TABS = [
    { id: 'staff',  label: 'Staff & permissions' },
    { id: 'rooms',  label: 'Rooms & beds' },
    { id: 'system', label: 'System access' },
  ] as const;

  return (
    <div>
      <div className="border-b border-[var(--color-line)] px-5 pt-4">
        <div role="tablist" aria-label="Administration" className="flex gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-t-md px-3 py-2 text-[12.5px] font-medium transition ${
                tab === id
                  ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'staff'  ? <StaffView centreName={centre.name} onInvite={() => setTab('system')} /> : null}
      {tab === 'rooms'  ? <RoomsAndBedsAdmin centre={centre} /> : null}
      {tab === 'system' ? <UsersAndRoles /> : null}
    </div>
  );
}
