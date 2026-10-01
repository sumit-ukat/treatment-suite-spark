import { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, CalendarDays, CheckCircle2, Printer, Search, X } from 'lucide-react';
import { discharge as dischargeService, type DischargeLogRow } from '../../services/data-access.js';
import { PageHeader } from '../../components/metric-card.tsx';
import { Chip } from '../../components/ui.tsx';
import { CARE_STATUS_LABEL, CARE_STATUS_TONE } from '../rooms/category-status.js';
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
  /** yyyy-MM, from an <input type="month"> — narrows to clients discharged in one calendar month. */
  const [monthFilter, setMonthFilter] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name'>('recent');

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
    return rows
      .filter((r) => {
        if (!q) return true;
        return (
          (r.client_name ?? '').toLowerCase().includes(q) ||
          r.client_reference.toLowerCase().includes(q) ||
          (r.discharge_location ?? '').toLowerCase().includes(q) ||
          (r.referral_partner_name ?? '').toLowerCase().includes(q)
        );
      })
      .filter((r) => {
        if (!monthFilter) return true;
        return !!r.actual_discharge_at && r.actual_discharge_at.slice(0, 7) === monthFilter;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return (a.client_name ?? a.client_reference).localeCompare(b.client_name ?? b.client_reference);
        const aTime = a.actual_discharge_at ? new Date(a.actual_discharge_at).getTime() : 0;
        const bTime = b.actual_discharge_at ? new Date(b.actual_discharge_at).getTime() : 0;
        return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
      });
  }, [rows, query, monthFilter, sortBy]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-5">
      <PageHeader
        title="Discharge"
        description="Every discharged client, most recent first — where they went, what happened with the report, and who handled it."
        actions={
          <>
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 size-4 text-[var(--color-ink-muted)]" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search client, reference or location"
                className="h-9 w-[220px] rounded-[7px] border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12px] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <div className="relative flex shrink-0 items-center">
              <CalendarDays className="pointer-events-none absolute left-2.5 size-3.5 text-[var(--color-ink-muted)]" aria-hidden />
              <input
                type="month"
                value={monthFilter}
                max={new Date().toISOString().slice(0, 7)}
                onChange={(e) => setMonthFilter(e.target.value)}
                aria-label="Show only clients discharged in this month"
                title="Discharge month — show only clients discharged in this calendar month"
                className="h-9 rounded-[7px] border border-[var(--color-line)] bg-card pl-8 pr-2 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
                style={{ width: monthFilter ? '9.5rem' : '8.5rem' }}
              />
              {monthFilter ? (
                <button
                  type="button"
                  onClick={() => setMonthFilter('')}
                  aria-label="Clear month filter"
                  className="absolute right-1.5 rounded p-0.5 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
            <div className="relative flex shrink-0 items-center">
              <ArrowDownAZ className="pointer-events-none absolute left-2.5 size-3.5 text-[var(--color-ink-muted)]" aria-hidden />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label="Sort discharges"
                className="h-9 shrink-0 rounded-[7px] border border-[var(--color-line)] bg-card py-0 pl-8 pr-2.5 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="recent">Left treatment (newest)</option>
                <option value="oldest">Left treatment (oldest)</option>
                <option value="name">Name (A–Z)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[7px] border border-[var(--color-line)] bg-card px-3 text-[12px] font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]"
            >
              <Printer className="size-3.5" /> Print
            </button>
          </>
        }
      />

      <p className="mt-3 hidden text-[10px] text-black print:block">
        Printed {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        {' '}&middot; {visible.length} client{visible.length === 1 ? '' : 's'} shown
      </p>

      <div className="mt-5 print:mt-2">
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
          <div className="overflow-x-auto rounded-[10px] border border-[var(--color-line)] print:overflow-visible print:rounded-none print:border-0">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Client</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">KIPU No.</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Left treatment</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Reports / transfer</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Location</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Referral partner</th>
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
                    <td className="px-3 py-2.5">
                      {r.care_status ? (
                        <Chip label={CARE_STATUS_LABEL[r.care_status]} tone={CARE_STATUS_TONE[r.care_status]} />
                      ) : (
                        <span className="text-[var(--color-ink-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.discharge_report_status ?? <span className="text-[var(--color-ink-muted)]">—</span>}</td>
                    <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.discharge_location ?? <span className="text-[var(--color-ink-muted)]">—</span>}</td>
                    <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.referral_partner_name ?? <span className="text-[var(--color-ink-muted)]">—</span>}</td>
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
