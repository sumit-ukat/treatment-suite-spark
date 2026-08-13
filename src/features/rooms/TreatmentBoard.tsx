import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Printer, Search } from 'lucide-react';
import { buildRealBoard } from './real-board-data.js';
import type { BoardBed } from './board-data.js';
import { Chip, StatTile } from '../../components/ui.tsx';
import { PhotoBadge } from './BedCard.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import { TreatmentDetailPanel } from './TreatmentDetailPanel.tsx';

// ─── Task group summaries — each group shows done/total + a progress bar ──────

const GROUPS = [
  {
    key: 'family',
    label: 'Family contact',
    codes: ['family_contact_24h', 'family_contact_week_1', 'family_contact_week_2', 'family_contact_pre_discharge'],
    hdrCls: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
    barCls: 'bg-sky-500',
  },
  {
    key: 'survey',
    label: 'Survey',
    codes: ['satisfaction_survey_7day'],
    hdrCls: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300',
    barCls: 'bg-yellow-400',
  },
  {
    key: 'medical',
    label: 'Medical',
    codes: ['gp_summary'],
    hdrCls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    barCls: 'bg-emerald-500',
  },
  {
    key: 'milestone',
    label: 'Care plan',
    codes: ['life_story', 'step_1', 'step_2', 'step_3', 'ccp'],
    hdrCls: 'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
    barCls: 'bg-violet-500',
  },
  {
    key: 'session',
    label: 'Sessions',
    codes: ['session_intro', 'session_week_1', 'session_week_2', 'session_week_3', 'session_week_4'],
    hdrCls: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300',
    barCls: 'bg-indigo-500',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtStr(s: string): string {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ─── Group summary cell ───────────────────────────────────────────────────────

function GroupSummaryCell({
  tasks,
  codes,
  barCls,
}: {
  tasks: readonly { code: string; isComplete: boolean; isOverdue: boolean; isDueToday: boolean; isNotApplicable: boolean }[];
  codes: string[];
  barCls: string;
}) {
  const applicable = tasks.filter((t) => codes.includes(t.code) && !t.isNotApplicable);
  if (applicable.length === 0) {
    return <td className="min-w-[120px] border-b border-[var(--color-line)] px-3 py-3 text-center text-[var(--color-ink-muted)]">—</td>;
  }
  const done = applicable.filter((t) => t.isComplete).length;
  const overdue = applicable.filter((t) => t.isOverdue).length;
  const dueToday = applicable.filter((t) => t.isDueToday && !t.isOverdue).length;
  const total = applicable.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <td className="min-w-[120px] border-b border-[var(--color-line)] px-3 py-2.5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="nums tabular-nums text-[13px] font-semibold text-[var(--color-ink)]">
            {done}<span className="font-normal text-[var(--color-ink-muted)]">/{total}</span>
          </span>
          {overdue > 0 ? (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">
              ▲ {overdue} late
            </span>
          ) : dueToday > 0 ? (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              ● {dueToday} today
            </span>
          ) : null}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
          <div
            className={`h-full rounded-full ${overdue > 0 ? 'bg-red-500' : barCls}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type FilterId = 'all' | 'overdue' | 'due_today' | 'available' | 'discharge_soon' | 'no_therapist' | 'open_concerns';

export function TreatmentBoard({
  centreId,
  centreName,
}: {
  centreId: string;
  centreName: string;
}) {
  const navigate = useNavigate();
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);

  const [beds, setBeds] = useState<readonly BoardBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [boardVersion, setBoardVersion] = useState(0);
  const [openBedLabel, setOpenBedLabel] = useState<string | null>(null);
  // True once we have data — subsequent refreshes update silently without blanking the board.
  const hasDataRef = useRef(false);

  const selected = beds.find((b) => b.label === openBedLabel) ?? null;

  useEffect(() => {
    let cancelled = false;
    if (hasDataRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    buildRealBoard(centreId)
      .then(({ board }) => {
        if (!cancelled) {
          setBeds(board);
          hasDataRef.current = true;
          setError(null);
          setLoadedAt(new Date());
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      });
    return () => { cancelled = true; };
  }, [centreId, boardVersion]);

  // Keep top scrollbar phantom width in sync with real table scroll width.
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const update = () => setTableScrollWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [beds]);

  const counts = useMemo(() => ({
    clients:       beds.filter((b) => b.occupant).length,
    available:     beds.filter((b) => !b.occupant).length,
    overdue:       beds.filter((b) => (b.occupant?.overdueCount ?? 0) > 0).length,
    dueToday:      beds.filter((b) => (b.occupant?.dueTodayCount ?? 0) > 0).length,
    dischargeSoon: beds.filter((b) => b.occupant !== null && b.occupant.daysUntilDischarge <= 7).length,
    noTherapist:   beds.filter((b) => b.occupant !== null && !b.occupant.therapist).length,
    openConcerns:  beds.filter((b) => b.occupant?.hasOpenConcern === true).length,
  }), [beds]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return beds.filter((bed) => {
      if (activeFilter === 'overdue'        && (bed.occupant?.overdueCount ?? 0) === 0) return false;
      if (activeFilter === 'due_today'      && (bed.occupant?.dueTodayCount ?? 0) === 0) return false;
      if (activeFilter === 'available'      && bed.occupant !== null) return false;
      if (activeFilter === 'discharge_soon' && (bed.occupant === null || bed.occupant.daysUntilDischarge > 7)) return false;
      if (activeFilter === 'no_therapist'   && (bed.occupant === null || !!bed.occupant.therapist)) return false;
      if (activeFilter === 'open_concerns'  && !bed.occupant?.hasOpenConcern) return false;
      if (!q) return true;
      const o = bed.occupant;
      return (
        bed.label.toLowerCase().includes(q) ||
        (o?.displayName.toLowerCase().includes(q) ?? false) ||
        (o?.reference.toLowerCase().includes(q) ?? false) ||
        (o?.therapist?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [beds, activeFilter, query]);

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading treatment board…</div>;
  }
  if (error) {
    return (
      <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not load the treatment board: {error}
      </div>
    );
  }

  const toggle = (f: FilterId) => setActiveFilter((prev) => (prev === f ? 'all' : f));

  // Header cell — matches BedList's header label style
  const th = 'border-b border-[var(--color-line)] bg-card px-3 py-2 text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-[var(--color-ink-muted)] whitespace-nowrap';

  return (
    <div className="space-y-6 px-4 py-5 sm:px-5">

      {/* ── Page header — matches BoardPage's PageHeader ── */}
      <PageHeader
        title={`${centreName} treatment board`}
        description={`Every bed and every clinical task in one view.${loadedAt ? ` Last updated at ${fmtTime(loadedAt)}.` : ''}${refreshing ? ' Updating…' : ''}`}
        actions={
          <>
            <label className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2.5 size-4 text-[var(--color-ink-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search client name or bed"
                className="h-9 w-[220px] rounded-lg border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12.5px] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => navigate('../admissions')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-[12.5px] font-semibold text-white transition hover:opacity-90"
            >
              <Plus className="size-4" /> Admit client
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-card px-3 text-[12.5px] font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]"
            >
              <Printer className="size-3.5" /> Print
            </button>
          </>
        }
      />

      {/* ── Summary tiles — StatTile matches GroupDashboard / BoardPage ── */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <StatTile
          label="Clients on the ward"
          value={counts.clients}
          tone="accent"
          active={activeFilter === 'all'}
          onClick={() => setActiveFilter('all')}
        />
        <StatTile
          label="Beds free"
          value={counts.available}
          active={activeFilter === 'available'}
          onClick={() => toggle('available')}
        />
        <StatTile
          label="With overdue tasks"
          value={counts.overdue}
          icon="▲"
          tone="alert"
          active={activeFilter === 'overdue'}
          onClick={() => toggle('overdue')}
        />
        <StatTile
          label="With tasks due today"
          value={counts.dueToday}
          icon="●"
          tone="warn"
          active={activeFilter === 'due_today'}
          onClick={() => toggle('due_today')}
        />
        <StatTile
          label="Discharging this week"
          value={counts.dischargeSoon}
          icon="↗"
          tone="warn"
          active={activeFilter === 'discharge_soon'}
          onClick={() => toggle('discharge_soon')}
        />
        <StatTile
          label="No therapist assigned"
          value={counts.noTherapist}
          active={activeFilter === 'no_therapist'}
          onClick={() => toggle('no_therapist')}
        />
        <StatTile
          label="Open concerns"
          value={counts.openConcerns}
          icon="⚑"
          tone="warn"
          active={activeFilter === 'open_concerns'}
          onClick={() => toggle('open_concerns')}
        />
      </div>

      {/* ── Table ── */}
      {/* Top scrollbar — mirrors the bottom one so users can scroll without reaching the foot */}
      <div
        ref={topScrollRef}
        className="overflow-x-auto rounded-t-xl"
        style={{ height: 12 }}
        onScroll={(e) => {
          if (tableWrapRef.current) tableWrapRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div style={{ width: tableScrollWidth, height: 1 }} />
      </div>

      <div
        ref={tableWrapRef}
        className="overflow-x-auto rounded-b-xl border border-[var(--color-line)] bg-card"
        onScroll={(e) => {
          if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <table className="min-w-max border-separate border-spacing-0 text-[12.5px]">

          <thead className="sticky top-0 z-20">
            {/* Row 1 — category group spans */}
            <tr>
              <th
                colSpan={8}
                className="border-b border-r border-[var(--color-line)] bg-card px-3 py-2 text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-[var(--color-ink-muted)]"
              >
                Client &amp; Placement
              </th>
              {GROUPS.map((g) => (
                <th
                  key={g.key}
                  className={`border-b border-[var(--color-line)] px-3 py-2 text-center text-[10px] font-semibold tracking-[0.06em] uppercase whitespace-nowrap ${g.hdrCls}`}
                >
                  {g.label}
                </th>
              ))}
            </tr>

            {/* Row 2 — individual column headers */}
            <tr>
              <th className={`sticky left-0 z-30 w-16 ${th}`}>Bed</th>
              {/* Shadow on Client column marks the freeze boundary */}
              <th className={`sticky left-16 z-30 min-w-[168px] border-r border-[var(--color-line)] shadow-[2px_0_6px_rgba(0,0,0,0.06)] ${th}`}>
                Client
              </th>
              <th className={th}>Status</th>
              <th className={th}>Day</th>
              <th className={th}>Admitted</th>
              <th className={th}>Discharge</th>
              <th className={th}>Group</th>
              <th className={th}>Therapist</th>
              {GROUPS.map((g) => (
                <th
                  key={g.key}
                  className="min-w-[120px] border-b border-[var(--color-line)] bg-card px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.04em] uppercase text-[var(--color-ink-muted)]"
                >
                  {g.codes.length} task{g.codes.length !== 1 ? 's' : ''}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visible.map((bed) => {
              const o = bed.occupant;
              // Shared cell border — horizontal divider only, matching BedList's divide-y
              const cb = 'border-b border-[var(--color-line)]';
              const stickyCell = `sticky z-10 bg-card ${cb}`;

              /* ── Empty bed ── */
              if (!o) {
                return (
                  <tr key={bed.label} className="opacity-60">
                    <td className={`${stickyCell} left-0 w-16 px-3 py-3`}>
                      <span className="nums rounded-md bg-[color:color-mix(in_oklab,var(--brand-blue)_24%,transparent)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--brand-blue-ink)]">
                        {bed.label}
                      </span>
                    </td>
                    <td className={`${stickyCell} left-16 min-w-[168px] border-r border-[var(--color-line)] px-3 py-3 italic text-[var(--color-ink-muted)] shadow-[2px_0_6px_rgba(0,0,0,0.04)]`}>
                      Available{bed.shared ? ' — shared room' : ''}
                    </td>
                    <td className={`${cb} px-3 py-3`}>
                      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                        Available
                      </span>
                    </td>
                    {Array.from({ length: 5 + GROUPS.length }).map((_, i) => (
                      <td key={i} className={`${cb} px-3 py-3 text-[var(--color-ink-muted)]`}>—</td>
                    ))}
                  </tr>
                );
              }

              /* ── Occupied bed ── */
              const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));
              const urgentDischarge = o.daysUntilDischarge <= 2;
              const rowBg = o.overdueCount > 0
                ? 'bg-red-50 dark:bg-red-950/30'
                : o.dueTodayCount > 0
                ? 'bg-amber-50 dark:bg-amber-950/25'
                : '';
              const osc = `sticky z-10 ${rowBg || 'bg-card'} ${cb}`;

              return (
                <tr
                  key={bed.label}
                  className={`cursor-pointer transition-colors hover:bg-[var(--color-accent-soft)] ${rowBg}`}
                  onClick={() => setOpenBedLabel(bed.label)}
                >
                  {/* Frozen: Bed */}
                  <td className={`${osc} left-0 w-16 px-3 py-3`}>
                    <span className="nums rounded-md bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--color-accent)]">
                      {bed.label}
                    </span>
                  </td>

                  {/* Frozen: Client — shadow marks freeze boundary */}
                  <td
                    className={`${osc} relative left-16 min-w-[168px] px-3 py-3 shadow-[2px_0_6px_rgba(0,0,0,0.05)] ${
                      o.hasRestrictedAlert
                        ? 'border-r-[3px] border-r-red-400 dark:border-r-red-500'
                        : o.hasOpenConcern
                        ? 'border-r-[3px] border-r-amber-400 dark:border-r-amber-500'
                        : 'border-r border-[var(--color-line)]'
                    }`}
                    title={o.hasRestrictedAlert ? 'High risk — see client profile' : o.hasOpenConcern ? 'Open concern logged — see client profile' : undefined}
                  >
                    {o.hasRestrictedAlert ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-red-50/70 to-transparent dark:from-red-950/25"
                      />
                    ) : o.hasOpenConcern ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-50/70 to-transparent dark:from-amber-950/25"
                      />
                    ) : null}
                    <div className="relative flex items-center gap-2">
                      <PhotoBadge occupant={o} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                            {o.displayName}
                          </span>
                          {o.hasRestrictedAlert && (
                            <Chip icon="⚑" label="Alert" tone="alert" />
                          )}
                        </div>
                        <div className="nums text-[11px] text-[var(--color-ink-muted)]">{o.reference}</div>
                      </div>
                    </div>
                  </td>

                  {/* Status — Chip tones match BedList attention column */}
                  <td className={`${cb} px-3 py-3`}>
                    {o.overdueCount > 0 ? (
                      <Chip icon="▲" label="Overdue" tone="alert" />
                    ) : o.dueTodayCount > 0 ? (
                      <Chip icon="●" label="Due today" tone="warn" />
                    ) : (
                      <Chip icon="✓" label="On track" tone="good" />
                    )}
                  </td>

                  {/* Treatment day + progress bar */}
                  <td className={`${cb} px-3 py-3 whitespace-nowrap`}>
                    <span className="nums text-[12.5px]">
                      {o.treatmentDay}
                      <span className="text-[var(--color-ink-muted)]"> / {o.durationDays}</span>
                    </span>
                    {/* Progress bar — matches BedList's track style */}
                    <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>

                  {/* Admitted */}
                  <td className={`${cb} px-3 py-3 whitespace-nowrap text-[var(--color-ink-muted)]`}>
                    {fmt(o.admittedAt)}
                  </td>

                  {/* Planned discharge */}
                  <td
                    className={`${cb} nums px-3 py-3 whitespace-nowrap text-[12.5px] ${
                      urgentDischarge
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : 'text-[var(--color-ink-muted)]'
                    }`}
                  >
                    {fmtStr(o.plannedDischargeDate)}
                  </td>

                  {/* Group */}
                  <td className={`${cb} px-3 py-3 text-center text-[var(--color-ink-muted)]`}>
                    {o.group || '—'}
                  </td>

                  {/* Therapist — plain amber text matches BedList */}
                  <td className={`${cb} px-3 py-3 whitespace-nowrap`}>
                    {o.therapist ? (
                      <span className="text-[12.5px]">{o.therapist}</span>
                    ) : (
                      <span className="text-[12.5px] text-amber-600 dark:text-amber-400">Not assigned</span>
                    )}
                  </td>

                  {/* Task group summaries */}
                  {GROUPS.map((g) => (
                    <GroupSummaryCell key={g.key} tasks={o.tasks} codes={g.codes} barCls={g.barCls} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Treatment detail panel with prev/next navigation ── */}
      {selected ? (() => {
        const occupiedBeds = beds.filter((b) => b.occupant !== null);
        const currentIdx = occupiedBeds.findIndex((b) => b.label === selected.label);
        const prevBed = currentIdx > 0 ? occupiedBeds[currentIdx - 1] : null;
        const nextBed = currentIdx < occupiedBeds.length - 1 ? occupiedBeds[currentIdx + 1] : null;
        return (
          <TreatmentDetailPanel
            key={selected.label}
            bed={selected}
            centreId={centreId}
            onClose={() => setOpenBedLabel(null)}
            onChanged={() => setBoardVersion((v) => v + 1)}
            onPrev={prevBed ? () => setOpenBedLabel(prevBed.label) : undefined}
            onNext={nextBed ? () => setOpenBedLabel(nextBed.label) : undefined}
          />
        );
      })() : null}

      {/* ── Legend ── */}
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
          How to read the task summary columns
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-[12px] text-[var(--color-ink)]">
          <div className="flex items-center gap-2">
            <span className="nums text-[13px] font-semibold">3<span className="font-normal text-[var(--color-ink-muted)]">/4</span></span>
            Tasks completed out of total applicable
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">▲ 2 late</span>
            Tasks in this group are overdue — click the row to action them
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">● 1 today</span>
            Tasks due today in this group
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-10 rounded-full bg-[var(--color-accent)]" />
            Progress bar — fills as tasks complete; turns red if any are overdue
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-red-500" />
            Red border on client name — safeguarding concern flagged
          </div>
        </div>
      </div>

    </div>
  );
}
