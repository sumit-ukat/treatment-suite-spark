import { ArrowDownAZ, ArrowRightLeft, Filter, GraduationCap, LogOut, Search, UserMinus, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { useAuth } from '../auth/AuthProvider.tsx';
import type { ClientSearchResult } from '../../services/data-access.js';
import { formatDate } from '../../lib/format.js';
import { Chip } from '../../components/ui.tsx';
import { MetricCard, PageHeader } from '../../components/metric-card.tsx';
import { ClientAvatar } from '../../components/brand.tsx';
import { DatePresetBar } from '../../components/date-preset-bar.tsx';
import { presetRange, type DatePreset } from '../../lib/date-presets.js';
import { useClientSearch } from './useClientSearch.js';
import { ClientFilePanel } from './ClientFilePanel.tsx';

/** The directory's "Status" column follows the discharge workflow's own taxonomy (Graduated / Early
 * Discharged / Transferred / Other, from discharge_type — see migration 0072) rather than the
 * separate Treatment Board care_status flag, since Reason/Sub Reason only ever come from a
 * discharge record, not from care_status. "In Treatment" covers anyone still admitted. */
const DISCHARGE_TYPE_STATUS_LABEL: Record<string, string> = {
  planned: 'Graduated',
  early: 'Early Discharged',
  transfer: 'Transferred',
  other: 'Other',
};
const DISCHARGE_TYPE_STATUS_TONE: Record<string, 'good' | 'warn' | 'accent' | 'neutral'> = {
  planned: 'good',
  early: 'warn',
  transfer: 'accent',
  other: 'neutral',
};

/** Initials and a stable 0-2 hue, both derived from real fields rather than stored — a client search
 * result has no "avatar colour" of its own, and shouldn't grow one just to feed ClientAvatar. */
function initialsOf(name: string): string {
  return name.split(/[\s.]+/).filter(Boolean).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
}
function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The first screen that lets staff find a client by name or reference, rather than only by already
 * having their bed open on the room board. Backed by `app.search_clients` (migration 0028, listing
 * everyone by default since migration 0032) — see those migrations for why this is scoped to one
 * centre rather than the whole organisation, and why a caller lacking `clients.view_identity` can
 * search by reference but not by name.
 *
 * A result opens `ClientFilePanel` — every admission this client has had at this centre, the first
 * place in the app a discharged client's history can be seen at all.
 */
export function ClientDirectory({
  centre,
  onOpenBed,
}: {
  centre: AccessibleCentre;
  /** Jumps to the client's live bed on the room board — only meaningful when they're currently
   * resident, so ClientFilePanel only offers it then. */
  onOpenBed?: ((bedLabel: string) => void) | undefined;
}) {
  const { can } = useAuth();
  const { query, setQuery, results, loading, error } = useClientSearch(centre.id);
  const [openClient, setOpenClient] = useState<ClientSearchResult | null>(null);
  const [scope, setScope] = useState<'all' | 'current' | 'former'>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  /** yyyy-MM, from the Month picker — only meaningful while datePreset === 'month'. */
  const [monthValue, setMonthValue] = useState<string>('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name' | 'discharge_recent' | 'discharge_oldest'>('recent');

  const canSearch = can('clients.view_operational') || can('clients.view_identity');
  const canSeeNames = can('clients.view_identity');

  const dateRange = useMemo(() => presetRange(datePreset, monthValue), [datePreset, monthValue]);

  /**
   * Centre census for the selected period — moved here from the Executive Hub, where the same
   * breakdown had to be fictional for 9 of 10 centres. Here it's real outright: `results` already
   * carries `last_admitted_at`/`last_discharge_at`/`last_discharge_type` for this one real centre, no
   * separate query needed. Computed from `results` (whatever the search box currently returned, which
   * is everyone when it's empty) rather than `visible`, so the `scope` toggle (Currently resident /
   * Former) — a different dimension, who's still here — doesn't also narrow what's meant to be a
   * period-wide activity count.
   */
  const activityCounts = useMemo(() => {
    const inRange = (d: string | null) => {
      if (!d) return false;
      if (!dateRange) return true;
      const day = d.slice(0, 10);
      return day >= dateRange.start && day <= dateRange.end;
    };
    let admitted = 0, discharged = 0, graduated = 0, early = 0, transferred = 0;
    for (const r of results) {
      if (inRange(r.last_admitted_at)) admitted++;
      if (r.last_discharge_type && inRange(r.last_discharge_at)) {
        discharged++;
        if (r.last_discharge_type === 'planned') graduated++;
        else if (r.last_discharge_type === 'early') early++;
        else if (r.last_discharge_type === 'transfer') transferred++;
      }
    }
    return { admitted, discharged, graduated, early, transferred };
  }, [results, dateRange]);

  // Filters whatever a search already returned — it does not fetch more than the search itself
  // already asked for. The date filter uses last_admitted_at as a proxy: it shows every client whose
  // most recent admission falls in the chosen range. Former clients without a stored discharge date
  // may still appear even if they left before the range's end — this only ever checks when they
  // arrived, not when they left.
  const visible = results.filter((r) => {
    if (scope === 'current') return r.has_open_admission;
    if (scope === 'former') return !r.has_open_admission;
    return true;
  }).filter((r) => {
    if (!dateRange) return true;
    if (!r.last_admitted_at) return false;
    const d = r.last_admitted_at.slice(0, 10);
    return d >= dateRange.start && d <= dateRange.end;
  }).sort((a, b) => {
    if (sortBy === 'name') return (a.display_name ?? a.reference).localeCompare(b.display_name ?? b.reference);
    if (sortBy === 'discharge_recent' || sortBy === 'discharge_oldest') {
      // Clients still admitted (no discharge date) always sort after every discharged one, in either
      // direction — there's no meaningful "oldest"/"newest" discharge for someone who hasn't left yet.
      if (!a.last_discharge_at && !b.last_discharge_at) return 0;
      if (!a.last_discharge_at) return 1;
      if (!b.last_discharge_at) return -1;
      const aTime = new Date(a.last_discharge_at).getTime();
      const bTime = new Date(b.last_discharge_at).getTime();
      return sortBy === 'discharge_oldest' ? aTime - bTime : bTime - aTime;
    }
    const aTime = a.last_admitted_at ? new Date(a.last_admitted_at).getTime() : 0;
    const bTime = b.last_admitted_at ? new Date(b.last_admitted_at).getTime() : 0;
    return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
  });

  if (!canSearch) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to search clients at {centre.name}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-5 sm:px-5">
      <PageHeader
        eyebrow={centre.name}
        title="Client directory"
        description={
          !loading && query.trim().length === 0
            ? `${results.length} ${results.length === 1 ? 'person has' : 'people have'} stayed at this centre`
            : canSeeNames
              ? 'Search by name or reference. Only clients with an admission at this centre — past or present — appear here.'
              : 'Search by reference. Names are withheld for your role; only clients with an admission at this centre — past or present — appear here.'
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-soft">
        <span className="flex items-center gap-1.5 pl-1 text-xs font-semibold text-muted-foreground">
          <Filter className="size-3.5" /> Filters
        </span>
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Search clients</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={canSeeNames ? 'Search by name, reference or concern' : 'Search by reference…'}
            className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12.5px] transition focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
          aria-label="Filter by residency"
          className="h-9 shrink-0 rounded-lg border border-[var(--color-line)] bg-card px-2.5 text-[12.5px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">Everyone</option>
          <option value="current">Currently resident</option>
          <option value="former">Former clients</option>
        </select>
        <div className="relative flex shrink-0 items-center">
          <ArrowDownAZ className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" aria-hidden />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Sort clients"
            className="h-9 shrink-0 rounded-lg border border-[var(--color-line)] bg-card py-0 pl-8 pr-2.5 text-[12.5px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="recent">Latest admission (newest)</option>
            <option value="oldest">Latest admission (oldest)</option>
            <option value="discharge_recent">Discharge date (newest)</option>
            <option value="discharge_oldest">Discharge date (oldest)</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
        {results.length > 0 ? (
          <span className="tabular ml-auto shrink-0 pr-1 text-xs text-muted-foreground">
            {visible.length} result{visible.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      <DatePresetBar
        preset={datePreset}
        monthValue={monthValue}
        onPresetChange={(p) => { setDatePreset(p); setMonthValue(''); }}
        onMonthChange={(m) => { setMonthValue(m); setDatePreset(m ? 'month' : 'all'); }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Total Clients"
          value={activityCounts.admitted}
          hint="admitted in period"
          icon={<UserPlus className="size-4" />}
        />
        <MetricCard
          label="Discharged"
          value={activityCounts.discharged}
          hint="any discharge type"
          icon={<LogOut className="size-4" />}
        />
        <MetricCard
          label="Graduated"
          value={activityCounts.graduated}
          hint="completed treatment"
          icon={<GraduationCap className="size-4" />}
          accent="primary"
        />
        <MetricCard
          label="Early Discharged"
          value={activityCounts.early}
          hint="left before planned discharge"
          icon={<UserMinus className="size-4" />}
        />
        <MetricCard
          label="Transferred"
          value={activityCounts.transferred}
          hint="moved to another facility"
          icon={<ArrowRightLeft className="size-4" />}
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-[12.5px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div>
        {query.trim().length === 1 ? (
          <p className="text-[12px] text-muted-foreground">
            Keep typing — a single character is too broad to search.
          </p>
        ) : loading ? (
          <p className="text-[12px] text-muted-foreground">Loading clients…</p>
        ) : results.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {query.trim().length >= 2
              ? `No clients matched at ${centre.name}.`
              : `No clients have stayed at ${centre.name} yet.`}
          </p>
        ) : (
          visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-line)] py-14 text-center">
              <p className="text-[13px] font-medium">No results match this filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-card">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                    <th className="px-4 py-2 text-left text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Name</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Admission Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Discharge Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Status</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Reason</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Sub Reason</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Total Tasks</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Completed</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Due / Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]">
                  {visible.map((r) => {
                    const label = r.display_name ?? r.reference;
                    const statusLabel = r.has_open_admission
                      ? 'In Treatment'
                      : r.last_discharge_type
                        ? (DISCHARGE_TYPE_STATUS_LABEL[r.last_discharge_type] ?? r.last_discharge_type)
                        : r.last_admission_status
                          ? (STATUS_LABEL[r.last_admission_status] ?? r.last_admission_status)
                          : null;
                    const statusTone = r.has_open_admission
                      ? 'accent'
                      : r.last_discharge_type
                        ? (DISCHARGE_TYPE_STATUS_TONE[r.last_discharge_type] ?? 'neutral')
                        : 'neutral';
                    return (
                      <tr
                        key={r.client_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpenClient(r)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenClient(r); } }}
                        className="cursor-pointer bg-card transition hover:bg-[var(--color-accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <ClientAvatar initials={initialsOf(label)} hue={hueOf(r.client_id)} photoUrl={r.photo_url} />
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold text-[var(--color-ink)]">{label}</div>
                              <div className="nums truncate text-[11px] text-muted-foreground">{r.reference}</div>
                            </div>
                          </div>
                        </td>
                        <td className="nums px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {r.last_admitted_at ? formatDate(new Date(r.last_admitted_at)) : '—'}
                        </td>
                        <td className="nums px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {r.last_discharge_at ? formatDate(new Date(r.last_discharge_at)) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {statusLabel ? <Chip label={statusLabel} tone={statusTone} /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.last_discharge_reason ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2.5 text-[var(--color-ink)]">{r.last_discharge_sub_reason ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="nums px-3 py-2.5 text-right text-[var(--color-ink)]">{r.last_total_tasks}</td>
                        <td className="nums px-3 py-2.5 text-right text-[var(--color-ink)]">{r.last_completed_tasks}</td>
                        <td className="nums px-3 py-2.5 text-right">
                          {r.last_due_overdue_tasks > 0 ? (
                            <span className="font-semibold text-[var(--color-overdue)]">{r.last_due_overdue_tasks}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {openClient ? (
        <ClientFilePanel
          client={openClient}
          centre={centre}
          onClose={() => setOpenClient(null)}
          onOpenBed={
            onOpenBed
              ? (bedLabel) => {
                  setOpenClient(null);
                  onOpenBed(bedLabel);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  discharged: 'Discharged',
  cancelled: 'Cancelled',
  planned: 'Planned',
  active: 'Active',
};
