import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import { auditEvents, centres as centresService, type AuditEventRow, type CentreRow } from '../../services/data-access.js';
import { Chip, Panel } from '../../components/ui.tsx';
import { formatDateWithDay } from '../../lib/format.js';

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
  const [actorQuery, setActorQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

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
    const q = actorQuery.trim().toLowerCase();
    return events.filter((e) => {
      if (recordType !== 'all' && e.record_type !== recordType) return false;
      if (action !== 'all' && e.action !== action) return false;
      if (q && !(e.actor_email ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, recordType, action, actorQuery]);

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
      <h2 className="text-[16px] font-semibold">Audit history</h2>
      <p className="mt-1 max-w-[640px] text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
        Every recorded change, most recent first — the most recent {events.length}. Scoped to what
        your access already lets you see; this screen adds no permission of its own.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={recordType}
          onChange={(e) => setRecordType(e.target.value)}
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px] focus:border-[var(--color-accent)] focus:outline-none"
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
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={actorQuery}
          onChange={(e) => setActorQuery(e.target.value)}
          placeholder="Filter by actor email…"
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>

      <Panel title="Events" subtitle={`${filtered.length} of ${events.length} shown`} className="mt-4">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-line)] py-14 text-center text-[13px] text-[var(--color-ink-muted)]">
            No events match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Record</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Centre</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <AuditRow
                    key={e.id}
                    event={e}
                    centreName={e.centre_id ? centresById.get(e.centre_id)?.name ?? null : null}
                    expanded={expanded === e.id}
                    onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

const ACTION_TONE: Record<string, 'good' | 'warn' | 'alert' | 'neutral'> = {
  insert: 'good',
  update: 'warn',
  delete: 'alert',
};

const COLUMN_COUNT = 6;

function AuditRow({
  event: e,
  centreName,
  expanded,
  onToggle,
}: {
  event: AuditEventRow;
  centreName: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  // A <tr> isn't natively focusable or activatable like a <button>, so both are added explicitly —
  // the previous list-based version got this for free from being a real <button>; a table row has to
  // ask for it.
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onToggle();
    }
  };

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className="cursor-pointer border-b border-[var(--color-line)] transition last:border-b-0 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <td className="py-2 pr-3">
          <Chip label={e.action} tone={ACTION_TONE[e.action] ?? 'neutral'} />
        </td>
        <td className="max-w-[220px] truncate py-2 pr-3">
          {e.record_type}
          <span className="ml-1 text-[var(--color-ink-muted)]">#{e.record_id.slice(0, 8)}</span>
        </td>
        <td className="max-w-[180px] truncate py-2 pr-3 text-[var(--color-ink-muted)]">
          {e.actor_email ?? 'System'}
        </td>
        <td className="py-2 pr-3 text-[var(--color-ink-muted)]">{centreName ?? '—'}</td>
        <td className="max-w-[220px] truncate py-2 pr-3 text-[var(--color-ink-muted)]">{e.reason ?? '—'}</td>
        <td className="nums py-2 pr-3 text-right whitespace-nowrap text-[var(--color-ink-muted)]">
          {formatDateWithDay(new Date(e.occurred_at))}
        </td>
      </tr>

      {expanded ? (
        <tr className="border-b border-[var(--color-line)] last:border-b-0">
          <td colSpan={COLUMN_COUNT} className="bg-black/[0.02] px-3 py-2.5 text-[11.5px] dark:bg-white/[0.03]">
            {e.changed_fields && e.changed_fields.length > 0 ? (
              <p className="text-[var(--color-ink-muted)]">
                Changed: <span className="font-medium text-[var(--color-ink)]">{e.changed_fields.join(', ')}</span>
              </p>
            ) : null}
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                  Before
                </div>
                <pre className="mt-1 max-h-[220px] overflow-auto rounded-md bg-black/[0.04] p-2 text-[10.5px] dark:bg-white/[0.06]">
                  {e.previous_value ? JSON.stringify(e.previous_value, null, 2) : '—'}
                </pre>
              </div>
              <div>
                <div className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                  After
                </div>
                <pre className="mt-1 max-h-[220px] overflow-auto rounded-md bg-black/[0.04] p-2 text-[10.5px] dark:bg-white/[0.06]">
                  {e.new_value ? JSON.stringify(e.new_value, null, 2) : '—'}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
