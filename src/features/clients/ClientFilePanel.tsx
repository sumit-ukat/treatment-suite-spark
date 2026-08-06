import { useEffect, useState } from 'react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { clients as clientsService, type ClientAdmissionHistoryRow } from '../../services/data-access.js';
import { formatDate, formatDateWithDay } from '../../lib/format.js';
import { Chip } from '../../components/ui.tsx';
import { STATUS_LABEL } from './ClientDirectory.tsx';

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
}: {
  client: { client_id: string; reference: string; display_name: string | null };
  centre: AccessibleCentre;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ClientAdmissionHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">
              {client.display_name ?? client.reference}
            </div>
            <div className="nums mt-0.5 text-[11.5px] text-[var(--color-ink-muted)]">
              {client.reference} &middot; {centre.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[13px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close panel"
          >
            &#10005;
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
    <li className="rounded-lg border border-[var(--color-line)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium">{formatDateWithDay(new Date(r.admitted_at))}</span>
        {isActive ? (
          <Chip icon="&#9679;" label="Active" tone="good" />
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
