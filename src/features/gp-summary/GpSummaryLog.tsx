import { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, CalendarDays, CheckCircle2, Printer, Search, X } from 'lucide-react';
import { gpSummary as gpSummaryService, type GpSummaryLogRow } from '../../services/data-access.js';
import { PageHeader } from '../../components/metric-card.tsx';
import { formatDate } from '../../lib/format.js';

/**
 * Every GP Summary at this centre, most recent admission first — replaces the centre's manual
 * "GP Summary Log" spreadsheet. Reads app.gp_summary_log (migration 0064), which queries the exact
 * same client_tasks / gp_summary_details rows the Treatment Board's GP Summary category panel
 * reads and writes — there is only one copy of this data. Editing it (surgery details, sign-offs)
 * still happens from the Treatment Board; this page is a read-only, centre-wide view of the same
 * thing, the same way the Discharge nav section is.
 */
export function GpSummaryLog({ centreId }: { centreId: string }) {
  const [rows, setRows] = useState<GpSummaryLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** yyyy-MM, from an <input type="month"> — narrows to clients admitted in one calendar month. */
  const [monthFilter, setMonthFilter] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name' | 'discharge_recent' | 'discharge_oldest'>('recent');

  useEffect(() => {
    let cancelled = false;
    gpSummaryService.log(centreId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the GP Summary log.'); });
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
          (r.surgery_name ?? '').toLowerCase().includes(q)
        );
      })
      .filter((r) => {
        if (!monthFilter) return true;
        return r.admitted_at.slice(0, 7) === monthFilter;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return (a.client_name ?? a.client_reference).localeCompare(b.client_name ?? b.client_reference);
        if (sortBy === 'discharge_recent' || sortBy === 'discharge_oldest') {
          // Still-admitted clients (no discharge date yet) always sort after every discharged one,
          // in either direction — there's no meaningful "oldest"/"newest" among clients who haven't
          // reached that milestone, so grouping them at the end is clearer than epoch-0 flipping
          // which end they land on depending on sort direction.
          if (!a.actual_discharge_at && !b.actual_discharge_at) return 0;
          if (!a.actual_discharge_at) return 1;
          if (!b.actual_discharge_at) return -1;
          const aTime = new Date(a.actual_discharge_at).getTime();
          const bTime = new Date(b.actual_discharge_at).getTime();
          return sortBy === 'discharge_oldest' ? aTime - bTime : bTime - aTime;
        }
        const aTime = new Date(a.admitted_at).getTime();
        const bTime = new Date(b.admitted_at).getTime();
        return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
      });
  }, [rows, query, monthFilter, sortBy]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-5">
      <PageHeader
        title="GP Summary"
        description="Every client's GP Summary, most recent admission first — surgery contact, when the request was sent and received, and the sign-off trail."
        actions={
          <>
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 size-4 text-[var(--color-ink-muted)]" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search client, reference or surgery"
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
                aria-label="Show only clients admitted in this month"
                title="Admission month — show only clients admitted in this calendar month"
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
                aria-label="Sort GP Summary log"
                className="h-9 shrink-0 rounded-[7px] border border-[var(--color-line)] bg-card py-0 pl-8 pr-2.5 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="recent">Admission (newest)</option>
                <option value="oldest">Admission (oldest)</option>
                <option value="discharge_recent">Discharge (newest)</option>
                <option value="discharge_oldest">Discharge (oldest)</option>
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
            Could not load the GP Summary log: {error}
          </div>
        ) : rows === null ? (
          <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading GP Summary log…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-6 text-[12.5px] text-[var(--color-ink-muted)]">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            No GP Summary tasks recorded yet at this centre.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-[var(--color-line)] print:overflow-visible print:rounded-none print:border-0">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Client</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">KIPU No.</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Admitted</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Discharged</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Surgery</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Email</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Telephone</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Request sent</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Received</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Doctor informed</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">UKAT doctor</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Confirmed</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Compliant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {visible.map((r) => (
                  <tr key={r.admission_id} className="bg-[var(--color-panel)]">
                    <td className="px-3 py-2.5 font-medium text-[var(--color-ink)]">
                      {r.client_name ?? <span className="text-[var(--color-ink-muted)] italic">Name withheld</span>}
                    </td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">{r.client_reference}</td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">{formatDate(new Date(r.admitted_at))}</td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {r.actual_discharge_at ? formatDate(new Date(r.actual_discharge_at)) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.surgery_name ?? <span className="text-[var(--color-ink-muted)]">—</span>}</td>
                    <td className="px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {r.surgery_email == null ? (
                        '—'
                      ) : r.surgery_email.includes('@') ? (
                        r.surgery_email
                      ) : (
                        // Some source rows have a status/consent note here instead of a real address
                        // (e.g. "No consent to contact GP") — shown as a note, not a broken email.
                        <span className="italic">{r.surgery_email}</span>
                      )}
                    </td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">{r.surgery_phone ?? '—'}</td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {r.request_sent_at ? (
                        <>
                          {formatDate(new Date(`${r.request_sent_at}T12:00:00`))}
                          {r.request_sent_by_name ? <span className="block text-[10.5px]">by {r.request_sent_by_name}</span> : null}
                        </>
                      ) : '—'}
                    </td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {r.received_at ? formatDate(new Date(`${r.received_at}T12:00:00`)) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {r.doctor_informed_at ? (
                        <>
                          {formatDate(new Date(r.doctor_informed_at))}
                          {r.doctor_informed_by_name ? <span className="block text-[10.5px]">by {r.doctor_informed_by_name}</span> : null}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.ukat_doctor ?? <span className="text-[var(--color-ink-muted)]">—</span>}</td>
                    <td className="px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {r.confirmed_checked_at ? (
                        <>
                          {formatDate(new Date(r.confirmed_checked_at))}
                          {r.confirmed_checked_by_name ? <span className="block text-[10.5px]">by {r.confirmed_checked_by_name}</span> : null}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.compliant === null ? (
                        <span className="text-[var(--color-ink-muted)]">—</span>
                      ) : r.compliant ? (
                        // Reversed on purpose, per explicit confirmation — Yes is red/No is green
                        // here, opposite of Overdue/Done everywhere else in the app.
                        <span className="inline-flex items-center rounded-full bg-[var(--color-overdue-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-overdue)]">Yes</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">No</span>
                      )}
                    </td>
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
