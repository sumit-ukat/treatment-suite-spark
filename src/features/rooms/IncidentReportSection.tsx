import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, ChevronDown, ChevronUp,
  FileWarning, MapPin, Pill, Plus, User, Users, CheckCircle2,
} from 'lucide-react';
import type { BoardBed } from './board-data.js';
import {
  incidents,
  type IncidentType,
  type IncidentSeverity,
  type IncidentReportRow,
} from '../../services/data-access.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: IncidentType; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'client',     label: 'Client',               icon: <User className="size-4" />,        hint: 'Incident involving a specific client' },
  { value: 'centre',     label: 'Centre / Environment', icon: <Building2 className="size-4" />,   hint: 'Building, facilities or equipment issue' },
  { value: 'medication', label: 'Medication',            icon: <Pill className="size-4" />,        hint: 'Medication error, wrong dose or near miss' },
  { value: 'staff',      label: 'Staff',                 icon: <Users className="size-4" />,       hint: 'Incident involving a staff member' },
  { value: 'other',      label: 'Other',                 icon: <FileWarning className="size-4" />, hint: 'Any other reportable incident' },
];

const SEVERITY_CHIP: Record<IncidentSeverity, string> = {
  low:      'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  medium:   'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  high:     'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const SEVERITY_DOT: Record<IncidentSeverity, string> = {
  low:      'bg-emerald-500',
  medium:   'bg-amber-500',
  high:     'bg-orange-500',
  critical: 'bg-red-500',
};

const TIME_FILTERS: { label: string; days: number | null }[] = [
  { label: 'Last 7 days',   days: 7 },
  { label: 'Last 30 days',  days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'All time',      days: null },
];

const PAGE_SIZE = 5;

const inputCls = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px] focus:border-[var(--color-accent)] focus:outline-none';
const labelCls = 'block text-[11px] font-medium text-[var(--color-ink-muted)] mb-0.5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function typeLabel(t: IncidentType): string {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function typeIcon(t: IncidentType) {
  return TYPE_OPTIONS.find((o) => o.value === t)?.icon ?? <FileWarning className="size-3.5" />;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  centreId: string;
  beds: readonly BoardBed[];
  onSubmitted?: () => void;
  defaultOpen?: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IncidentReportSection({ centreId, beds, onSubmitted, defaultOpen = false }: Props) {
  // Form state
  const [formOpen, setFormOpen] = useState(defaultOpen);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    incidentType: '' as IncidentType | '',
    severity: '' as IncidentSeverity | '',
    clientId: '',
    description: '',
    location: '',
    incidentAt: '',
  });

  // Log state
  const [rows, setRows] = useState<IncidentReportRow[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [filterDays, setFilterDays] = useState<number | null>(7);
  const [shown, setShown] = useState(PAGE_SIZE);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const activeClients = beds
    .filter((b) => b.occupant)
    .map((b) => ({ id: b.occupant!.clientId, name: b.occupant!.displayName, bed: b.label }));

  const selectedClient = activeClients.find((c) => c.id === form.clientId);

  // Load log whenever filter changes
  const loadLog = useCallback(() => {
    setLogLoading(true);
    incidents.list(centreId, filterDays != null ? { days: filterDays } : undefined)
      .then((data) => { setRows(data); setShown(PAGE_SIZE); })
      .catch(() => {})
      .finally(() => setLogLoading(false));
  }, [centreId, filterDays]);

  useEffect(() => { loadLog(); }, [loadLog]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.incidentType || !form.severity || !form.description.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await incidents.log(
        centreId,
        form.incidentType as IncidentType,
        form.severity as IncidentSeverity,
        form.description.trim(),
        {
          clientId:   form.clientId || undefined,
          clientName: selectedClient?.name || undefined,
          location:   form.location.trim() || undefined,
          incidentAt: form.incidentAt || undefined,
        },
      );
      setSubmitted(true);
      onSubmitted?.();
      loadLog();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'That did not work — please try again.');
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setSubmitted(false);
    setFormOpen(false);
    setForm({ incidentType: '', severity: '', clientId: '', description: '', location: '', incidentAt: '' });
    setFormError(null);
  }

  const visible = rows.slice(0, shown);
  const remaining = rows.length - shown;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Log incident form ── */}
      <div>
        <button
          type="button"
          onClick={() => { if (!submitted) setFormOpen((o) => !o); }}
          className="mb-3 flex w-full items-center justify-between gap-2"
        >
          <h2 className="text-[11px] font-semibold tracking-[0.07em] text-[var(--color-ink-muted)] uppercase">
            Log incident
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
              <Plus className="size-3" aria-hidden />
              New report
            </span>
            {formOpen
              ? <ChevronUp className="size-4 text-[var(--color-ink-muted)]" />
              : <ChevronDown className="size-4 text-[var(--color-ink-muted)]" />}
          </div>
        </button>

        {formOpen && (
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
            {submitted ? (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <CheckCircle2 className="size-10 text-emerald-500" />
                <p className="font-semibold text-[var(--color-ink)]">Incident logged</p>
                <p className="text-[12px] text-[var(--color-ink-muted)]">
                  This report has been recorded and appears in the log below.
                </p>
                <button
                  type="button"
                  onClick={resetForm}
                  className="mt-1 rounded-lg border border-[var(--color-line)] px-4 py-1.5 text-[12px] font-semibold transition hover:bg-[var(--color-accent-soft)]"
                >
                  Log another
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4 p-4">
                {/* Incident type */}
                <div>
                  <p className={labelCls}>Incident type <span className="text-red-500">*</span></p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {TYPE_OPTIONS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => { set('incidentType', t.value); if (t.value !== 'client') set('clientId', ''); }}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center text-[11px] font-medium transition ${
                          form.incidentType === t.value
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                            : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-ink)]'
                        }`}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {form.incidentType && (
                    <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
                      {TYPE_OPTIONS.find((t) => t.value === form.incidentType)?.hint}
                    </p>
                  )}
                </div>

                {form.incidentType === 'client' && (
                  <div>
                    <label className={labelCls}>Client (select from current admissions)</label>
                    <select value={form.clientId} onChange={(e) => set('clientId', e.target.value)} className={inputCls}>
                      <option value="">— Select client —</option>
                      {activeClients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} · Bed {c.bed}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <p className={labelCls}>Severity <span className="text-red-500">*</span></p>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(SEVERITY_CHIP) as IncidentSeverity[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => set('severity', s)}
                        className={`rounded-full border px-3 py-1 text-[12px] font-semibold capitalize transition ${
                          form.severity === s
                            ? SEVERITY_CHIP[s]
                            : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]/50'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Description <span className="text-red-500">*</span></label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={3}
                    placeholder="Describe what happened, who was involved, and any immediate action taken…"
                    className={`${inputCls} resize-none`}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Location (optional)</label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => set('location', e.target.value)}
                      placeholder="e.g. Dining room, Bed 4A corridor"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>When it happened (optional)</label>
                    <input
                      type="datetime-local"
                      value={form.incidentAt}
                      onChange={(e) => set('incidentAt', e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {formError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {formError}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="rounded-lg border border-[var(--color-line)] px-4 py-1.5 text-[12px] font-semibold transition hover:bg-[var(--color-accent-soft)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !form.incidentType || !form.severity || !form.description.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {busy ? 'Logging…' : 'Submit report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ── Incident log ── */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold tracking-[0.07em] text-[var(--color-ink-muted)] uppercase">
            Incident log
          </h2>
          <select
            value={filterDays ?? ''}
            onChange={(e) => setFilterDays(e.target.value === '' ? null : Number(e.target.value))}
            className="h-7 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[11.5px] focus:border-[var(--color-accent)] focus:outline-none"
          >
            {TIME_FILTERS.map((f) => (
              <option key={f.label} value={f.days ?? ''}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {logLoading ? (
          <p className="py-6 text-center text-[12px] text-[var(--color-ink-muted)]">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-line)] py-10 text-center">
            <p className="text-[13px] text-[var(--color-ink-muted)]">No incidents recorded in this period.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((r) => <IncidentRow key={r.id} row={r} />)}

            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="mt-1 rounded-lg border border-[var(--color-line)] py-2 text-[12px] font-semibold text-[var(--color-ink-muted)] transition hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)]"
              >
                Show {Math.min(remaining, PAGE_SIZE)} more
                <span className="ml-1 text-[var(--color-ink-muted)]">({remaining} remaining)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Individual log row ────────────────────────────────────────────────────────

function IncidentRow({ row }: { row: IncidentReportRow }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = row.description.length > 120;
  const preview = isLong && !expanded ? row.description.slice(0, 120) + '…' : row.description;

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <div className={`mt-1.5 size-2 shrink-0 rounded-full ${SEVERITY_DOT[row.severity]}`} />

        <div className="min-w-0 flex-1">
          {/* Top row: type + severity + time */}
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-ink)]">
              {typeIcon(row.incident_type)}
              {typeLabel(row.incident_type)}
            </span>
            {row.client_name && (
              <span className="text-[11.5px] text-[var(--color-ink-muted)]">· {row.client_name}</span>
            )}
            <span className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold capitalize ${SEVERITY_CHIP[row.severity]}`}>
              {row.severity}
            </span>
          </div>

          {/* Description */}
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink)]">
            {preview}
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="ml-1.5 text-[var(--color-accent)] hover:underline"
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </p>

          {/* Meta: location + time */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-ink-muted)]">
            {row.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden />
                {row.location}
              </span>
            )}
            <span>{relativeTime(row.incident_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
