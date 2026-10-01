import { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, CheckCircle2, Printer, Search } from 'lucide-react';
import { discharge as dischargeService, type DischargeLogRow } from '../../services/data-access.js';
import { PageHeader } from '../../components/metric-card.tsx';
import { Chip } from '../../components/ui.tsx';
import { DatePresetBar } from '../../components/date-preset-bar.tsx';
import { presetRange, type DatePreset } from '../../lib/date-presets.js';
import { CARE_STATUS_LABEL, CARE_STATUS_TONE } from '../rooms/category-status.js';
import { useBoardData } from '../rooms/use-board-data.js';
import type { Occupant } from '../rooms/board-data.js';
import { formatDate } from '../../lib/format.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { addCalendar, daysLeftInWeek, isSameZonedDate, toZonedDateString } from '../../domain/zoned-time.js';

// TODO: same scoped simplification as DetailPanel.tsx — every configured centre today is Europe/London.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

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

type TabId = 'today' | 'upcoming' | 'future' | 'past';

interface ActiveRow {
  bedLabel: string;
  occupant: Occupant;
}

/**
 * Every discharged admission at this centre, most recent first — replaces the centre's manual
 * discharge-report spreadsheet. All seven columns of that sheet the app didn't already track
 * (KIPU No. / reference and the date left were already there) get captured once, at the moment a
 * discharge is finalised (see DischargeWorkflowCard), and just show up here — nothing to re-enter.
 *
 * Four tabs split the centre's clients by where they sit relative to discharge, mirroring the
 * group's other internal discharge-tracking tool:
 * - Discharged Today / Past Discharges: already-discharged admissions (discharge_log), split by
 *   whether the discharge instant falls on today's calendar date.
 * - Upcoming Discharge (this week) / Future Discharge: still-active admissions (from the same real
 *   board data the Treatment Board and Room Board already load — no separate query), split by
 *   whether their current planned discharge date falls within the rest of this calendar week
 *   (Monday–Sunday, Europe/London — see zoned-time.ts's daysLeftInWeek for why a calendar week
 *   rather than a rolling 7 days) or later. A planned date already in the past (an overdue
 *   discharge that hasn't been finalised yet) counts as "this week" too — it's the most urgent
 *   bucket, not a hidden one.
 *
 * One honest gap versus that other tool's columns: it shows a "Funding" column (Self Funding /
 * etc.) — nothing in this schema captures a funding route for any client yet, so it's left out
 * here rather than invented. See DetailPanel.tsx's similar note about pronoun/funding.
 */
export function DischargeLog({ centreId }: { centreId: string }) {
  // null = no tab picked yet — shows every discharged client, same as this page looked before the
  // tabs existed. Picking a tab narrows to that bucket; clicking the active tab again clears back to
  // this unfiltered view rather than leaving no way back to it.
  const [tab, setTab] = useState<TabId | null>(null);
  const [rows, setRows] = useState<DischargeLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  /** yyyy-MM, from the Month picker — only meaningful while datePreset === 'month'. Applied against
   * whichever date is relevant to the active tab (left treatment for Today/Past, planned discharge
   * for Upcoming/Future). */
  const [monthValue, setMonthValue] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name' | 'admission_recent' | 'admission_oldest'>('recent');

  const dateRange = useMemo(() => presetRange(datePreset, monthValue), [datePreset, monthValue]);

  const { beds, loading: boardLoading, error: boardError } = useBoardData(centreId);

  useEffect(() => {
    let cancelled = false;
    dischargeService.log(centreId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the discharge log.'); });
    return () => { cancelled = true; };
  }, [centreId]);

  const now = new Date();
  const weekEnd = useMemo(() => toZonedDateString(addCalendar(now, daysLeftInWeek(now, TZ), 'days', TZ), TZ), []); // eslint-disable-line react-hooks/exhaustive-deps

  const { dischargedToday, pastDischarges, upcoming, future } = useMemo(() => {
    const discharged = rows ?? [];
    const dischargedToday = discharged.filter(
      (r) => r.actual_discharge_at != null && isSameZonedDate(new Date(r.actual_discharge_at), now, TZ),
    );
    const pastDischarges = discharged.filter(
      (r) => r.actual_discharge_at == null || !isSameZonedDate(new Date(r.actual_discharge_at), now, TZ),
    );

    const active: ActiveRow[] = beds.flatMap((b) => (b.occupant ? [{ bedLabel: b.label, occupant: b.occupant }] : []));
    const upcoming = active.filter((r) => r.occupant.plannedDischargeDate <= weekEnd);
    const future = active.filter((r) => r.occupant.plannedDischargeDate > weekEnd);

    return { dischargedToday, pastDischarges, upcoming, future };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, beds, weekEnd]);

  const visibleDischarged = useMemo(() => {
    const source = tab === 'today' ? dischargedToday : tab === 'past' ? pastDischarges : [...dischargedToday, ...pastDischarges];
    const q = query.trim().toLowerCase();
    return source
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
        if (!dateRange) return true;
        if (!r.actual_discharge_at) return false;
        const d = r.actual_discharge_at.slice(0, 10);
        return d >= dateRange.start && d <= dateRange.end;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return (a.client_name ?? a.client_reference).localeCompare(b.client_name ?? b.client_reference);
        if (sortBy === 'admission_recent' || sortBy === 'admission_oldest') {
          const aTime = new Date(a.admitted_at).getTime();
          const bTime = new Date(b.admitted_at).getTime();
          return sortBy === 'admission_oldest' ? aTime - bTime : bTime - aTime;
        }
        const aTime = a.actual_discharge_at ? new Date(a.actual_discharge_at).getTime() : 0;
        const bTime = b.actual_discharge_at ? new Date(b.actual_discharge_at).getTime() : 0;
        return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
      });
  }, [tab, dischargedToday, pastDischarges, query, dateRange, sortBy]);

  const visibleActive = useMemo(() => {
    const source = tab === 'upcoming' ? upcoming : future;
    const q = query.trim().toLowerCase();
    return source
      .filter((r) => {
        if (!q) return true;
        return r.occupant.displayName.toLowerCase().includes(q) || r.occupant.reference.toLowerCase().includes(q);
      })
      .filter((r) => {
        if (!dateRange) return true;
        const d = r.occupant.plannedDischargeDate;
        return d >= dateRange.start && d <= dateRange.end;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.occupant.displayName.localeCompare(b.occupant.displayName);
        if (sortBy === 'admission_recent' || sortBy === 'admission_oldest') {
          const aTime = a.occupant.admittedAt.getTime();
          const bTime = b.occupant.admittedAt.getTime();
          return sortBy === 'admission_oldest' ? aTime - bTime : bTime - aTime;
        }
        const cmp = a.occupant.plannedDischargeDate.localeCompare(b.occupant.plannedDischargeDate);
        return sortBy === 'oldest' ? -cmp : cmp;
      });
  }, [tab, upcoming, future, query, dateRange, sortBy]);

  const isDischargedTab = tab !== 'upcoming' && tab !== 'future';
  const loading = isDischargedTab ? rows === null : boardLoading;
  const loadError = isDischargedTab ? error : boardError;

  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: 'today', label: 'Discharged Today', count: dischargedToday.length },
    { id: 'upcoming', label: 'Upcoming Discharge (this week)', count: upcoming.length },
    { id: 'future', label: 'Future Discharge', count: future.length },
    { id: 'past', label: 'Past Discharges', count: pastDischarges.length },
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-5">
      <PageHeader
        title="Discharge"
        description="Every client relative to discharge — who's leaving today, who's due this week or later, and the full history of who already has."
        actions={
          <>
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 size-4 text-[var(--color-ink-muted)]" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isDischargedTab ? 'Search client, reference or location' : 'Search client or reference'}
                className="h-9 w-[220px] rounded-[7px] border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12px] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <div className="relative flex shrink-0 items-center">
              <ArrowDownAZ className="pointer-events-none absolute left-2.5 size-3.5 text-[var(--color-ink-muted)]" aria-hidden />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label="Sort"
                className="h-9 shrink-0 rounded-[7px] border border-[var(--color-line)] bg-card py-0 pl-8 pr-2.5 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {isDischargedTab ? (
                  <>
                    <option value="recent">Left treatment (newest)</option>
                    <option value="oldest">Left treatment (oldest)</option>
                  </>
                ) : (
                  <>
                    <option value="recent">Planned discharge (soonest)</option>
                    <option value="oldest">Planned discharge (latest)</option>
                  </>
                )}
                <option value="admission_recent">Admission date (newest)</option>
                <option value="admission_oldest">Admission date (oldest)</option>
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

      <div className="mt-4 flex flex-wrap gap-1.5 print:hidden" role="tablist" aria-label="Discharge view">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(tab === t.id ? null : t.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
              tab === t.id
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            {t.label}
            <span
              className={`nums inline-flex min-w-[1.3em] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold ${
                tab === t.id ? 'bg-[var(--color-accent)] text-white' : 'bg-black/[0.06] text-[var(--color-ink-muted)] dark:bg-white/10'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 print:hidden">
        <DatePresetBar
          preset={datePreset}
          monthValue={monthValue}
          onPresetChange={(p) => { setDatePreset(p); setMonthValue(''); }}
          onMonthChange={(m) => { setMonthValue(m); setDatePreset(m ? 'month' : 'all'); }}
        />
      </div>

      <p className="mt-3 hidden text-[10px] text-black print:block">
        Printed {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        {' '}&middot; {(isDischargedTab ? visibleDischarged.length : visibleActive.length)} client
        {(isDischargedTab ? visibleDischarged.length : visibleActive.length) === 1 ? '' : 's'} shown
      </p>

      <div className="mt-4 print:mt-2">
        {loadError ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            Could not load this view: {loadError}
          </div>
        ) : loading ? (
          <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading…</div>
        ) : isDischargedTab ? (
          visibleDischarged.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-6 text-[12.5px] text-[var(--color-ink-muted)]">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              {tab === 'today' ? 'No one has been discharged today.' : 'No discharges recorded yet at this centre.'}
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
                  {visibleDischarged.map((r) => (
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
          )
        ) : visibleActive.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-6 text-[12.5px] text-[var(--color-ink-muted)]">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            {tab === 'upcoming' ? 'No one is due to discharge this week.' : 'No one is due to discharge after this week.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-[var(--color-line)] print:overflow-visible print:rounded-none print:border-0">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Client</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">KIPU No.</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Admission date</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Planned discharge</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Admission status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Sub-status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Bed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {visibleActive.map(({ bedLabel, occupant: o }) => (
                  <tr key={o.admissionId ?? bedLabel} className="bg-[var(--color-panel)]">
                    <td className="px-3 py-2.5 font-medium text-[var(--color-ink)]">{o.displayName}</td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">{o.reference}</td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">{formatDate(o.admittedAt)}</td>
                    <td className="nums px-3 py-2.5 text-[var(--color-ink-muted)]">
                      {formatDate(new Date(`${o.plannedDischargeDate}T12:00:00`))}
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip label="In Treatment" tone="accent" />
                    </td>
                    <td className="px-3 py-2.5">
                      {o.careStatus ? (
                        <Chip label={CARE_STATUS_LABEL[o.careStatus]} tone={CARE_STATUS_TONE[o.careStatus]} />
                      ) : (
                        <span className="text-[var(--color-ink-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-ink)]">{bedLabel}</td>
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
