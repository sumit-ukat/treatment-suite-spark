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

const RECORD_NOUN: Record<string, string> = {
  admissions:               'Admission',
  beds:                     'Bed',
  client_photos:            'Client photo',
  client_tasks:             'Required action',
  clients:                  'Client record',
  detox_records:            'Detox record',
  discharge_requests:       'Discharge request',
  family_meetings:          'Family meeting',
  medical_review_requests:  'Medical review request',
  risk_records:             'Risk record',
  room_allocations:         'Room allocation',
  safeguarding_records:     'Safeguarding record',
  staff_assignments:        'Staff assignment',
  task_templates:           'Task template',
  user_access_assignments:  'Access assignment',
  user_profiles:            'User profile',
  incident_reports:         'Incident report',
};

const ACTION_VERB: Record<string, string> = {
  insert: 'Created',
  update: 'Updated',
  delete: 'Deleted',
};

/** Human-readable labels for database column names shown in the diff view. */
const FIELD_LABELS: Record<string, string> = {
  first_name:    'First name',
  last_name:     'Last name',
  date_of_birth: 'Date of birth',
  email:         'Email',
  phone:         'Phone',
  status:        'Status',
  discharge_type:'Discharge type',
  risk_level:    'Risk level',
  notes:         'Notes',
  start_date:    'Start date',
  end_date:      'End date',
  due_date:      'Due date',
  completed_at:  'Completed',
  title:         'Title',
  description:   'Description',
  type:          'Type',
  severity:      'Severity',
  reason:        'Reason',
  role:          'Role',
  incident_type: 'Incident type',
  incident_at:   'When it happened',
  location:      'Location',
  room_id:       'Room',
  bed_id:        'Bed',
  client_id:     'Client',
  therapist_id:  'Therapist',
};

/** Fields that add no user-facing value in a diff (timestamps, internal IDs, etc.) */
const SKIP_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'updated_by', 'reported_by',
  'actor_id', 'organisation_id', 'centre_id',
]);

function actionPhrase(e: AuditEventRow): string {
  const verb = ACTION_VERB[e.action] ?? e.action;
  const noun = RECORD_NOUN[e.record_type] ?? e.record_type;
  return `${verb} ${noun.toLowerCase()}`;
}

/** Render a single value as readable text — UUIDs are shortened, nulls become "(empty)". */
function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '(empty)';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  const str = String(val);
  // UUID-shaped strings: shorten for readability
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return `#${str.slice(0, 8)}`;
  }
  return str;
}

/** Changed-field rows for an update event, skipping internal/system fields. */
function ChangedFields({ event }: { event: AuditEventRow }) {
  const fields = (event.changed_fields ?? []).filter((f) => !SKIP_FIELDS.has(f));
  const prev = (event.previous_value ?? {}) as Record<string, unknown>;
  const next = (event.new_value ?? {}) as Record<string, unknown>;

  if (fields.length === 0) {
    // Insert or delete — show key fields from new_value or previous_value
    const obj = (event.action === 'delete' ? prev : next) as Record<string, unknown>;
    const visibleFields = Object.keys(obj).filter((k) => !SKIP_FIELDS.has(k));
    if (visibleFields.length === 0) {
      return <p className="text-[13px] text-[var(--color-ink-muted)]">No details available.</p>;
    }
    return (
      <div className="space-y-2">
        {visibleFields.slice(0, 12).map((field) => (
          <div key={field} className="grid grid-cols-[140px_1fr] gap-2 text-[12.5px]">
            <span className="font-medium text-[var(--color-ink-muted)]">
              {FIELD_LABELS[field] ?? field.replace(/_/g, ' ')}
            </span>
            <span className="text-[var(--color-ink)]">{formatValue(obj[field])}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const label = FIELD_LABELS[field] ?? field.replace(/_/g, ' ');
        const before = formatValue(prev[field]);
        const after = formatValue(next[field]);
        return (
          <div key={field}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--color-ink-muted)]">
              {label}
            </p>
            <div className="flex items-start gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 rounded-md bg-red-50 px-2.5 py-1.5 text-red-800 line-through dark:bg-red-950/40 dark:text-red-300">
                {before}
              </span>
              <span className="mt-1 shrink-0 text-[var(--color-ink-muted)]">→</span>
              <span className="min-w-0 flex-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                {after}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
    if (!canView) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([auditEvents.list(), centresService.listAccessible()])
      .then(([e, c]) => {
        if (cancelled) return;
        // Only show events made by a real logged-in user (exclude system/trigger events)
        setEvents(e.filter((ev) => ev.actor_email !== null));
        setCentres(c);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
      if (q && !`${e.actor_email ?? ''} ${RECORD_NOUN[e.record_type] ?? e.record_type} ${ACTION_VERB[e.action] ?? e.action} ${e.reason ?? ''}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [events, recordType, action, searchQuery]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view the activity log.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading activity log…</div>;
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
        title="Activity log"
        description={`Every change made by your team, most recent first — showing the latest ${events.length} user actions.`}
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
              {RECORD_NOUN[t] ?? t}
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
              {ACTION_VERB[a] ?? a}
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
                <DialogTitle className="capitalize">{actionPhrase(selected)}</DialogTitle>
                <DialogDescription>
                  {selected.actor_email} &middot; {formatDateWithDay(new Date(selected.occurred_at))}
                </DialogDescription>
              </DialogHeader>
              <ChangedFields event={selected} />
              {selected.reason ? (
                <p className="border-t border-[var(--color-line)] pt-3 text-[12.5px] text-[var(--color-ink-muted)]">
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
  const changedFields = (e.changed_fields ?? [])
    .filter((f) => !SKIP_FIELDS.has(f))
    .map((f) => FIELD_LABELS[f] ?? f.replace(/_/g, ' '))
    .slice(0, 4);

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium capitalize">
          {actionPhrase(e)}
          {changedFields.length > 0 && (
            <span className="ml-1.5 font-normal text-[var(--color-ink-muted)]">
              — {changedFields.join(', ')}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">
          {e.actor_email} &middot; {formatDateWithDay(new Date(e.occurred_at))}
          {centreName ? <> &middot; {centreName}</> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Chip
          label={ACTION_VERB[e.action] ?? e.action}
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
