import { Eye, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import { auditEvents, centres as centresService, type AuditEventRow, type CentreRow } from '../../services/data-access.js';
import { Chip, Panel } from '../../components/ui.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx';
import { formatDateWithDay } from '../../lib/format.js';

/** Friendly nouns for every record_type actually seen in production (checked directly against
 * audit_events, not guessed from table names) — everything else falls back to the raw value rather
 * than a made-up label for a table nobody has written to yet. */
const RECORD_NOUN: Record<string, string> = {
  admissions: 'admission',
  beds: 'bed',
  client_photos: 'client photo',
  client_tasks: 'required action',
  clients: 'client record',
  detox_records: 'detox record',
  discharge_requests: 'discharge request',
  family_meetings: 'family meeting',
  medical_review_requests: 'medical review request',
  risk_records: 'risk record',
  room_allocations: 'room allocation',
  safeguarding_records: 'safeguarding record',
  staff_assignments: 'staff assignment',
  task_templates: 'task template',
  user_access_assignments: 'access assignment',
  user_profiles: 'user profile',
};

const ACTION_VERB: Record<string, string> = {
  insert: 'Created',
  update: 'Updated',
  delete: 'Deleted',
};

/** "Created required action", not "insert · client_tasks" — a plain-English phrase built only from
 * the two real fields every event already has, not a guess at *why* (this table has no join to a
 * client's or staff member's name, and no record of which specific status change happened). */
function actionPhrase(e: AuditEventRow): string {
  const verb = ACTION_VERB[e.action] ?? e.action;
  const noun = RECORD_NOUN[e.record_type] ?? e.record_type;
  return `${verb} ${noun}`;
}

/**
 * Audit history — the first screen to show `audit_events`, which every write in this system has been
 * recording since migration 0009. Every "verified with SQL" claim across this whole build checked
 * this table directly; this is the same data, just readable without a database console.
 *
 * Read-only by construction, not by convention: `audit_events` has no write grant at all for
 * `authenticated` (only `app.audit_row`'s trigger, running SECURITY DEFINER, ever inserts), and the
 * existing `audit_read` policy (migration 0009) already does the permission and centre-access
 * filtering — this screen adds no new server-side logic, just a way to look at what already exists.
 *
 * A browsing window, not an export: capped at 300 rows, most recent first, filtered client-side. A
 * proper export or a wider time range is a distinct, larger feature (`reports.export` already exists
 * as a separate permission for exactly that reason) — not something to half-build here.
 */
export function AuditHistory() {
  const { can } = useAuth();
  const canView = can('audit.view');

  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [centres, setCentres] = useState<CentreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recordType, setRecordType] = useState('all');
  const [action, setAction] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<AuditEventRow | null>(null);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([auditEvents.list(), centresService.listAccessible()])
      .then(([e, c]) => {
        if (cancelled) return;
        setEvents(e);
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
  }, [canView]);

  const centresById = useMemo(() => new Map(centres.map((c) => [c.id, c])), [centres]);

  const recordTypes = useMemo(
    () => [...new Set(events.map((e) => e.record_type))].sort(),
    [events],
  );
  const actions = useMemo(() => [...new Set(events.map((e) => e.action))].sort(), [events]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((e) => {
      if (recordType !== 'all' && e.record_type !== recordType) return false;
      if (action !== 'all' && e.action !== action) return false;
      if (
        q &&
        !`${e.actor_email ?? ''} ${e.record_type} ${e.action} ${e.reason ?? ''}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [events, recordType, action, searchQuery]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view the audit history.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading audit history…</div>;
  }

  if (loadError) {
    return (
      <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not load this screen: {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[960px] px-5 py-8">
      <PageHeader
        title="Audit history"
        description={`Every recorded change, most recent first — the most recent ${events.length}. Scoped to what your access already lets you see; this screen adds no permission of its own.`}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-soft">
        <select
          value={recordType}
          onChange={(e) => setRecordType(e.target.value)}
          className="h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[12px] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">All record types</option>
          {recordTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[12px] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by person, action or record…"
            className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] pl-9 pr-2.5 text-[12px] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>
      </div>

      <Panel title="Events" subtitle={`${filtered.length} of ${events.length} shown`} className="mt-4">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-line)] py-14 text-center text-[13px] text-[var(--color-ink-muted)]">
            No events match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {filtered.map((e) => (
              <AuditRow
                key={e.id}
                event={e}
                centreName={e.centre_id ? centresById.get(e.centre_id)?.name ?? null : null}
                onView={() => setSelected(e)}
              />
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{actionPhrase(selected)}</DialogTitle>
                <DialogDescription>
                  {selected.record_type} #{selected.record_id.slice(0, 8)} &middot;{' '}
                  {formatDateWithDay(new Date(selected.occurred_at))}
                </DialogDescription>
              </DialogHeader>
              {selected.changed_fields && selected.changed_fields.length > 0 ? (
                <p className="text-[12.5px] text-[var(--color-ink-muted)]">
                  Changed:{' '}
                  <span className="font-medium text-[var(--color-ink)]">
                    {selected.changed_fields.join(', ')}
                  </span>
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                    Before
                  </div>
                  <pre className="mt-1 max-h-[280px] overflow-auto rounded-md bg-black/[0.04] p-2 text-[11px] dark:bg-white/[0.06]">
                    {selected.previous_value ? JSON.stringify(selected.previous_value, null, 2) : '—'}
                  </pre>
                </div>
                <div>
                  <div className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                    After
                  </div>
                  <pre className="mt-1 max-h-[280px] overflow-auto rounded-md bg-black/[0.04] p-2 text-[11px] dark:bg-white/[0.06]">
                    {selected.new_value ? JSON.stringify(selected.new_value, null, 2) : '—'}
                  </pre>
                </div>
              </div>
              {selected.reason ? (
                <p className="text-[12.5px] text-[var(--color-ink-muted)]">
                  Reason: <span className="text-[var(--color-ink)]">{selected.reason}</span>
                </p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ACTION_TONE: Record<string, 'good' | 'warn' | 'alert' | 'neutral'> = {
  insert: 'good',
  update: 'warn',
  delete: 'alert',
};

function AuditRow({
  event: e,
  centreName,
  onView,
}: {
  event: AuditEventRow;
  centreName: string | null;
  onView: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">
          {actionPhrase(e)}
          <span className="ml-1.5 font-normal text-[var(--color-ink-muted)]">
            #{e.record_id.slice(0, 8)}
          </span>
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">
          {e.actor_email ?? 'System'} &middot; {formatDateWithDay(new Date(e.occurred_at))}
          {centreName ? <> &middot; {centreName}</> : null}
          {e.reason ? <> &middot; {e.reason}</> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Chip
          label={e.action.charAt(0).toUpperCase() + e.action.slice(1)}
          tone={ACTION_TONE[e.action] ?? 'neutral'}
        />
        <button
          type="button"
          onClick={onView}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Eye className="size-3.5" /> View change
        </button>
      </div>
    </li>
  );
}
