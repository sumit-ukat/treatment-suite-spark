import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import {
  clients as clientsService,
  concerns as concernsService,
  type ClientAdmissionHistoryRow,
  type ConcernCategory,
  type ConcernRow,
} from '../../services/data-access.js';
import { formatDate, formatDateWithDay } from '../../lib/format.js';
import { Chip } from '../../components/ui.tsx';
import { StatusBadge } from '../../components/status-badge.tsx';
import { ClientAvatar } from '../../components/brand.tsx';
import { STATUS_LABEL } from './ClientDirectory.tsx';

const CATEGORY_LABELS: Record<ConcernCategory, string> = {
  behaviour: 'Behaviour',
  risk:      'Risk',
  medical:   'Medical',
  welfare:   'Welfare',
  general:   'General',
};

function initialsOf(name: string): string {
  return name.split(/[\s.]+/).filter(Boolean).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
}
function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The client file: every admission a client has had at this centre, past and present. Opened from a
 * directory search result — the first place in this application a discharged client's history can be
 * seen at all, since the room board only ever shows an active admission.
 *
 * Deliberately read-only, and deliberately not a rebuild of the room board's task list: an active
 * admission's tasks already have a full Mark done / Reopen UI there (migration 0026) with its own
 * permission checks. This shows a completed/total tally per admission — enough to know how a stay is
 * going without a second copy of that logic to keep in sync. See migration 0029's header comment for
 * the full reasoning, including why staff labels are shown regardless of `clients.view_identity` (they
 * describe the admission, not the client's own identity) and why history is scoped to this centre only.
 */
export function ClientFilePanel({
  client,
  centre,
  onClose,
  onOpenBed,
}: {
  client: { client_id: string; reference: string; display_name: string | null };
  centre: AccessibleCentre;
  onClose: () => void;
  /** Jumps to the client's live bed on the room board. Only rendered when there's an active
   * admission with a bed label to jump to — this screen has no other route back onto the board. */
  onOpenBed?: ((bedLabel: string) => void) | undefined;
}) {
  const [rows, setRows] = useState<ClientAdmissionHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concerns, setConcerns] = useState<ConcernRow[] | null>(null);
  const [showConcernForm, setShowConcernForm] = useState(false);
  const [concernNote, setConcernNote] = useState('');
  const [concernCategory, setConcernCategory] = useState<ConcernCategory>('general');
  const [concernBusy, setConcernBusy] = useState(false);
  const [concernError, setConcernError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    clientsService
      .history(client.client_id, centre.id)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client.client_id, centre.id]);

  useEffect(() => {
    let cancelled = false;
    setConcerns(null);
    concernsService
      .list(centre.id, client.client_id)
      .then((data) => { if (!cancelled) setConcerns(data); })
      .catch(() => { if (!cancelled) setConcerns([]); });
    return () => { cancelled = true; };
  }, [client.client_id, centre.id]);

  const activeAdmission = rows?.find((r) => r.status === 'active') ?? null;

  async function submitConcern() {
    if (!concernNote.trim() || !activeAdmission) return;
    setConcernBusy(true);
    setConcernError(null);
    try {
      await concernsService.log(
        client.client_id,
        activeAdmission.admission_id,
        centre.id,
        concernNote,
        concernCategory,
      );
      setConcernNote('');
      setConcernCategory('general');
      setShowConcernForm(false);
      // Refresh list
      const updated = await concernsService.list(centre.id, client.client_id);
      setConcerns(updated);
    } catch (err) {
      setConcernError(err instanceof Error ? err.message : 'Could not save concern.');
    } finally {
      setConcernBusy(false);
    }
  }

  async function resolveConcern(id: string) {
    try {
      await concernsService.resolve(id);
      setConcerns((prev) =>
        prev ? prev.map((c) => c.id === id ? { ...c, is_resolved: true } : c) : prev,
      );
    } catch {
      // non-critical — silently swallow
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-20 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Client file ${client.reference}`}
        className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[520px] flex-col border-l border-[var(--color-line)] bg-[var(--color-panel)] shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-line)] p-4">
          <ClientAvatar
            initials={initialsOf(client.display_name ?? client.reference)}
            hue={hueOf(client.client_id)}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold">
                {client.display_name ?? client.reference}
              </span>
              {rows ? (
                <StatusBadge
                  status={activeAdmission ? 'ontrack' : 'neutral'}
                  label={activeAdmission ? 'Currently resident' : 'Former client'}
                  size="sm"
                />
              ) : null}
            </div>
            <div className="nums mt-0.5 text-[11.5px] text-[var(--color-ink-muted)]">
              {client.reference} &middot; {centre.name}
            </div>
            {activeAdmission?.bed_label && onOpenBed ? (
              <button
                type="button"
                onClick={() => onOpenBed(activeAdmission.bed_label!)}
                className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--color-accent)] hover:underline"
              >
                Open current admission <ArrowRight className="size-3" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close panel"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h3 className="mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
            Admission history
          </h3>

          {error ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-[12.5px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          ) : rows === null ? (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              No admissions recorded at {centre.name}.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => (
                <AdmissionCard key={r.admission_id} row={r} />
              ))}
            </ul>
          )}
        </div>

        {/* ── Concerns ── */}
        <div className="border-t border-[var(--color-line)] px-4 py-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-500" />
              <h3 className="text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                Concerns
              </h3>
              {concerns && concerns.filter((c) => !c.is_resolved).length > 0 ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {concerns.filter((c) => !c.is_resolved).length} open
                </span>
              ) : null}
            </div>
            {activeAdmission && !showConcernForm ? (
              <button
                type="button"
                onClick={() => setShowConcernForm(true)}
                className="text-[11.5px] font-medium text-[var(--color-accent)] hover:underline"
              >
                + Log concern
              </button>
            ) : null}
          </div>

          {/* Log form */}
          {showConcernForm ? (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800/50 dark:bg-amber-950/20">
              <p className="mb-2 text-[11.5px] font-medium text-amber-800 dark:text-amber-300">
                New concern
              </p>
              <select
                value={concernCategory}
                onChange={(e) => setConcernCategory(e.target.value as ConcernCategory)}
                className="mb-2 h-8 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {(Object.entries(CATEGORY_LABELS) as [ConcernCategory, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <textarea
                autoFocus
                rows={3}
                placeholder="Describe the concern…"
                value={concernNote}
                onChange={(e) => setConcernNote(e.target.value)}
                className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
              />
              {concernError ? (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{concernError}</p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={concernBusy || !concernNote.trim()}
                  onClick={() => void submitConcern()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11.5px] font-semibold text-white transition disabled:opacity-40 hover:bg-amber-700"
                >
                  {concernBusy ? 'Saving…' : 'Save concern'}
                </button>
                <button
                  type="button"
                  disabled={concernBusy}
                  onClick={() => { setShowConcernForm(false); setConcernNote(''); setConcernError(null); }}
                  className="rounded-lg px-3 py-1.5 text-[11.5px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* Concern list */}
          {concerns === null ? (
            <p className="text-[11.5px] text-[var(--color-ink-muted)]">Loading…</p>
          ) : concerns.length === 0 ? (
            <p className="text-[11.5px] text-[var(--color-ink-muted)]">No concerns logged.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {concerns.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-lg border p-2.5 text-[12px] ${
                    c.is_resolved
                      ? 'border-[var(--color-line)] bg-[var(--color-surface)] opacity-60'
                      : 'border-amber-200 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-950/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 uppercase tracking-wide">
                          {CATEGORY_LABELS[c.category as ConcernCategory] ?? c.category}
                        </span>
                        {c.is_resolved ? (
                          <span className="text-[9.5px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wide">Resolved</span>
                        ) : null}
                      </div>
                      <p className="mt-1 leading-snug text-[var(--color-ink)]">{c.note}</p>
                      <p className="mt-0.5 text-[10.5px] text-[var(--color-ink-muted)]">
                        {c.logged_by_name} · {formatDate(new Date(c.logged_at))}
                      </p>
                    </div>
                    {!c.is_resolved ? (
                      <button
                        type="button"
                        onClick={() => void resolveConcern(c.id)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        Resolve
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-[var(--color-line)] px-4 py-3 text-[11px] text-[var(--color-ink-muted)]">
          Detox, medical, safeguarding and therapy notes are not shown here — they sit behind
          sensitivity level 3 and need the access model first.
        </footer>
      </aside>
    </>
  );
}

function AdmissionCard({ row: r }: { row: ClientAdmissionHistoryRow }) {
  const isActive = r.status === 'active';
  return (
    <li className="rounded-xl border bg-card p-3 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium">{formatDateWithDay(new Date(r.admitted_at))}</span>
        {isActive ? (
          <StatusBadge status="ontrack" label="Active" size="sm" />
        ) : (
          <Chip label={STATUS_LABEL[r.status] ?? r.status} />
        )}
      </div>

      <dl className="nums mt-2 grid grid-cols-2 gap-y-1.5 text-[12px]">
        <Fact label="Bed" value={r.bed_label ?? '—'} />
        <Fact
          label={isActive ? 'Planned discharge' : 'Discharged'}
          value={
            isActive
              ? formatDate(r.current_planned_discharge_date)
              : r.actual_discharge_at
                ? `${formatDate(new Date(r.actual_discharge_at))}${r.discharge_type ? ` (${DISCHARGE_TYPE_LABEL[r.discharge_type] ?? r.discharge_type})` : ''}`
                : '—'
          }
        />
        <Fact label="Focal therapist" value={r.therapist_label ?? 'Not assigned'} />
        <Fact label="Buddy" value={r.buddy_label ?? '—'} />
        <Fact label="Substance" value={r.substance_name ?? '—'} />
        <Fact label="Group" value={r.treatment_group ?? '—'} />
      </dl>

      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-ink-muted)]">
        <span>
          {r.completed_task_count} of {r.total_task_count} actions complete
        </span>
        {r.peep_required ? <Chip label="PEEP" /> : null}
      </div>
    </li>
  );
}

const DISCHARGE_TYPE_LABEL: Record<string, string> = {
  planned: 'Planned',
  early: 'Early',
  transfer: 'Transfer',
  other: 'Other',
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-[var(--color-ink-muted)]">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
