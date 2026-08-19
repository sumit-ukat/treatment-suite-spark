import { useState } from 'react';
import { AlertTriangle, Building2, Pill, User, Users, FileWarning, Plus, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { BoardBed } from './board-data.js';
import { incidents, type IncidentType, type IncidentSeverity } from '../../services/data-access.js';

const TYPE_OPTIONS: { value: IncidentType; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'client',     label: 'Client',              icon: <User className="size-4" />,         hint: 'Incident involving a specific client' },
  { value: 'centre',     label: 'Centre / Environment', icon: <Building2 className="size-4" />,   hint: 'Building, facilities or equipment issue' },
  { value: 'medication', label: 'Medication',           icon: <Pill className="size-4" />,         hint: 'Medication error, wrong dose or near miss' },
  { value: 'staff',      label: 'Staff',                icon: <Users className="size-4" />,        hint: 'Incident involving a staff member' },
  { value: 'other',      label: 'Other',                icon: <FileWarning className="size-4" />,  hint: 'Any other reportable incident' },
];

const SEVERITY_OPTIONS: { value: IncidentSeverity; label: string; colour: string }[] = [
  { value: 'low',      label: 'Low',      colour: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'medium',   label: 'Medium',   colour: 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'high',     label: 'High',     colour: 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'critical', label: 'Critical', colour: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
];

const inputCls = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px] focus:border-[var(--color-accent)] focus:outline-none';
const labelCls = 'block text-[11px] font-medium text-[var(--color-ink-muted)] mb-0.5';

interface Props {
  centreId: string;
  beds: readonly BoardBed[];
  onSubmitted?: () => void;
}

export function IncidentReportSection({ centreId, beds, onSubmitted }: Props) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    incidentType: '' as IncidentType | '',
    severity: '' as IncidentSeverity | '',
    clientId: '',
    description: '',
    location: '',
    incidentAt: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const activeClients = beds
    .filter((b) => b.occupant)
    .map((b) => ({ id: b.occupant!.clientId, name: b.occupant!.displayName, bed: b.label }));

  const selectedClient = activeClients.find((c) => c.id === form.clientId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.incidentType || !form.severity || !form.description.trim()) return;
    setBusy(true);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work — please try again.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSubmitted(false);
    setOpen(false);
    setForm({ incidentType: '', severity: '', clientId: '', description: '', location: '', incidentAt: '' });
    setError(null);
  }

  return (
    <div>
      {/* Section header */}
      <button
        type="button"
        onClick={() => { if (!submitted) setOpen((o) => !o); }}
        className="mb-3 flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.07em] text-[var(--color-ink-muted)] uppercase">
            Incident Reports
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
            <Plus className="size-3" aria-hidden />
            Log incident
          </span>
          {open ? <ChevronUp className="size-4 text-[var(--color-ink-muted)]" /> : <ChevronDown className="size-4 text-[var(--color-ink-muted)]" />}
        </div>
      </button>

      {open && (
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
          {submitted ? (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <p className="font-semibold text-[var(--color-ink)]">Incident logged</p>
              <p className="text-[12px] text-[var(--color-ink-muted)]">This report has been recorded and will appear in the group incident count.</p>
              <button
                type="button"
                onClick={reset}
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

              {/* Client picker — only when type = client */}
              {form.incidentType === 'client' && (
                <div>
                  <label className={labelCls}>Client (select from current admissions)</label>
                  <select
                    value={form.clientId}
                    onChange={(e) => set('clientId', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Select client —</option>
                    {activeClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · Bed {c.bed}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Severity */}
              <div>
                <p className={labelCls}>Severity <span className="text-red-500">*</span></p>
                <div className="flex flex-wrap gap-2">
                  {SEVERITY_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => set('severity', s.value)}
                      className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
                        form.severity === s.value
                          ? s.colour
                          : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]/50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
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

              {/* Location + When in a 2-col grid */}
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

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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
  );
}
