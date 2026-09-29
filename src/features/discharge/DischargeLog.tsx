import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import { discharge as dischargeService, type DischargeLogRow } from '../../services/data-access.js';
import { PageHeader } from '../../components/metric-card.tsx';
import { formatDate } from '../../lib/format.js';

const TYPE_LABEL: Record<string, string> = {
  planned: 'Planned',
  early: 'Early',
  transfer: 'Transfer',
  other: 'Other',
};

const TYPE_TONE: Record<string, string> = {
  planned: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  early: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  transfer: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  other: 'bg-black/[0.06] text-[var(--color-ink-muted)] dark:bg-white/10',
};

/**
 * Every discharged admission at this centre, most recent first — replaces the centre's manual
 * discharge-report spreadsheet. All seven columns of that sheet the app didn't already track
 * (KIPU No. / reference and the date left were already there) get captured once, at the moment a
 * discharge is finalised (see DischargeWorkflowCard), and just show up here — nothing to re-enter.
 */
export function DischargeLog({ centreId }: { centreId: string }) {
  const [rows, setRows] = useState<DischargeLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    dischargeService.log(centreId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the discharge log.'); });
    return () => { cancelled = true; };
  }, [centreId]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.client_name ?? '').toLowerCase().includes(q) ||
      r.client_reference.toLowerCase().includes(q) ||
      (r.discharge_location ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-5">
      <PageHeader
        title="Discharge"
        description="Every discharged client, most recent first — where they went, what happened with the report, and who handled it."
        actions={
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-[var(--color-ink-muted)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client, reference or location"
              className="h-9 w-[260px] rounded-[7px] border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12px] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>
        }
      />

      <div className="mt-5">
        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            Could not load the discharge log: {error}
          </div>
        ) : rows === null ? (
          <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading discharge log…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-6 text-[12.5px] text-[var(--color-ink-muted)]">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            No discharges recorded yet at this centre.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[10px] border border-[var(--color-line)]">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Client</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">KIPU No.</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Left treatment</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Reports / transfer</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Location</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Report sent</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Handled by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {visible.map((r) => (
                  <tr key={r.admission_id} className="bg-[var(--color-panel)]">
                    <td className="px-3 py-2.5 font-medium text-[var(--color-ink)]">
                      {r.client_name ?? <span className="text-[var(--color-ink-muted)] italic">Name withheld</span>}
                    </td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">{r.client_reference}</td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {r.actual_discharge_at ? formatDate(new Date(r.actual_discharge_at)) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.discharge_type ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_TONE[r.discharge_type] ?? TYPE_TONE.other}`}>
                          {TYPE_LABEL[r.discharge_type] ?? r.discharge_type}
                        </span>
                      ) : (
                        <span className="text-[var(--color-ink-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.discharge_report_status ?? <span className="text-[var(--color-ink-muted)]">—</span>}</td>
                    <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.discharge_location ?? <span className="text-[var(--color-ink-muted)]">—</span>}</td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {r.discharge_report_sent_at ? formatDate(new Date(`${r.discharge_report_sent_at}T12:00:00`)) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-ink-muted)]">{r.discharged_by_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
