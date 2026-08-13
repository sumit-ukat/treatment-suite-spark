import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Printer, Search } from 'lucide-react';
import { buildRealBoard } from './real-board-data.js';
import type { BoardBed } from './board-data.js';
import { Chip, StatTile, type Tone } from '../../components/ui.tsx';
import { PhotoBadge } from './BedCard.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import { TreatmentDetailPanel } from './TreatmentDetailPanel.tsx';

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  { code: 'family_contact_24h',          label: '24-Hour',        full: '24-hour family contact',              group: 'family'    },
  { code: 'family_contact_week_1',        label: 'Week 1',         full: 'Week 1 family contact',               group: 'family'    },
  { code: 'family_contact_week_2',        label: 'Week 2',         full: 'Week 2 family contact',               group: 'family'    },
  { code: 'family_contact_pre_discharge', label: 'Pre-Discharge',  full: 'Family contact 24 hrs before discharge', group: 'family'  },
  { code: 'satisfaction_survey_7day',     label: '7-Day Survey',   full: '7-day satisfaction survey',           group: 'survey'    },
  { code: 'gp_summary',                   label: 'GP Summary',     full: 'GP summary letter sent to GP',        group: 'medical'   },
  { code: 'life_story',                   label: 'Life Story',     full: 'Life story / surrender',              group: 'milestone' },
  { code: 'step_1',                       label: 'Step 1',         full: '12-Step programme — Step 1',          group: 'milestone' },
  { code: 'step_2',                       label: 'Step 2',         full: '12-Step programme — Step 2',          group: 'milestone' },
  { code: 'step_3',                       label: 'Step 3',         full: '12-Step programme — Step 3',          group: 'milestone' },
  { code: 'ccp',                          label: 'CCP',            full: 'Care & Continuing Plan (CCP)',         group: 'milestone' },
  { code: 'session_intro',                label: 'Intro',          full: 'Introductory counselling session',    group: 'session'   },
  { code: 'session_week_1',               label: 'Week 1',         full: 'Week 1 counselling session',          group: 'session'   },
  { code: 'session_week_2',               label: 'Week 2',         full: 'Week 2 counselling session',          group: 'session'   },
  { code: 'session_week_3',               label: 'Week 3',         full: 'Week 3 counselling session',          group: 'session'   },
  { code: 'session_week_4',               label: 'Week 4',         full: 'Week 4 counselling session',          group: 'session'   },
] as const;

const COL_GROUPS = [
  { label: 'Family contact', count: 4, cls: 'bg-sky-50    text-sky-800    dark:bg-sky-950/50    dark:text-sky-300'    },
  { label: 'Survey',         count: 1, cls: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300' },
  { label: 'Medical',        count: 1, cls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  { label: 'Care Plan',      count: 5, cls: 'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300' },
  { label: 'Milestone',      count: 5, cls: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300' },
] as const;

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

// ─── Task cell ────────────────────────────────────────────────────────────────

// Uses the same icon + tone vocabulary as the attention chips in BedList.
function TaskCell({ bed, code }: { bed: BoardBed; code: string }) {
  const o = bed.occupant;
  const td = 'w-[58px] border-b border-[var(--color-line)] px-1 py-2.5 text-center';

  if (!o) return <td className={td}><span className="text-[var(--color-ink-muted)]">—</span></td>;

  const task = o.tasks.find((t) => t.code === code);
  if (!task) return <td className={td}><span className="text-[var(--color-ink-muted)]">—</span></td>;

  if (task.isNotApplicable) {
    return (
      <td className={td}>
        <span className="text-[13px] text-[var(--color-ink-muted)]" title={task.notApplicableReason ?? 'Not applicable'}>×</span>
      </td>
    );
  }
  if (task.isComplete) {
    return (
      <td className={td}>
        <span title={task.completedBy ? `Done by ${task.completedBy}` : 'Done'}>
          <Chip icon="✓" label="" tone="good" />
        </span>
      </td>
    );
  }
  if (task.isOverdue) {
    return (
      <td className={td}>
        <span title="Overdue — action needed">
          <Chip icon="▲" label="" tone="alert" />
        </span>
      </td>
    );
  }
  if (task.isDueToday) {
    return (
      <td className={td}>
        <span title="Due today">
          <Chip icon="●" label="" tone="warn" />
        </span>
      </td>
    );
  }
  return (
    <td className={td}>
      <span
        className="text-[15px] leading-none text-[var(--color-ink-muted)]"
        title={task.dueAt ? `Due ${fmt(task.dueAt)}` : 'Not yet due'}
      >
        —
      </span>
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
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [boardVersion, setBoardVersion] = useState(0);
  const [openBedLabel, setOpenBedLabel] = useState<string | null>(null);

  const selected = beds.find((b) => b.label === openBedLabel) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buildRealBoard(centreId)
      .then(({ board }) => {
        if (!cancelled) { setBeds(board); setError(null); setLoadedAt(new Date()); }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
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
        description={`Every bed and every clinical task in one view.${loadedAt ? ` Last updated at ${fmtTime(loadedAt)}.` : ''}`}
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
          hint="Click to show all"
        />
        <StatTile
          label="Beds free"
          value={counts.available}
          active={activeFilter === 'available'}
          onClick={() => toggle('available')}
          hint="Click to filter"
        />
        <StatTile
          label="With overdue tasks"
          value={counts.overdue}
          icon="▲"
          tone="alert"
          active={activeFilter === 'overdue'}
          onClick={() => toggle('overdue')}
          hint="Click to filter"
        />
        <StatTile
          label="With tasks due today"
          value={counts.dueToday}
          icon="●"
          tone="warn"
          active={activeFilter === 'due_today'}
          onClick={() => toggle('due_today')}
          hint="Click to filter"
        />
        <StatTile
          label="Discharging this week"
          value={counts.dischargeSoon}
          icon="↗"
          tone="warn"
          active={activeFilter === 'discharge_soon'}
          onClick={() => toggle('discharge_soon')}
          hint="Click to filter"
        />
        <StatTile
          label="No therapist assigned"
          value={counts.noTherapist}
          active={activeFilter === 'no_therapist'}
          onClick={() => toggle('no_therapist')}
          hint="Click to filter"
        />
        <StatTile
          label="Open concerns"
          value={counts.openConcerns}
          icon="⚑"
          tone="warn"
          active={activeFilter === 'open_concerns'}
          onClick={() => toggle('open_concerns')}
          hint="Click to filter"
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
              {COL_GROUPS.map((g) => (
                <th
                  key={g.label}
                  colSpan={g.count}
                  className={`border-b border-[var(--color-line)] px-2 py-2 text-center text-[10px] font-semibold tracking-[0.06em] uppercase whitespace-nowrap ${g.cls}`}
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
              {COLUMNS.map((col) => (
                <th
                  key={col.code}
                  title={col.full}
                  className="w-[58px] border-b border-[var(--color-line)] bg-card px-1 py-2.5 text-center text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)]"
                >
                  {col.label}
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
                    {Array.from({ length: 5 + COLUMNS.length }).map((_, i) => (
                      <td key={i} className={`${cb} px-3 py-3 text-[var(--color-ink-muted)]`}>—</td>
                    ))}
                  </tr>
                );
              }

              /* ── Occupied bed ── */
              const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));
              const urgentDischarge = o.daysUntilDischarge <= 2;

              return (
                <tr
                  key={bed.label}
                  className="cursor-pointer transition-colors hover:bg-[var(--color-accent-soft)]"
                  onClick={() => setOpenBedLabel(bed.label)}
                >
                  {/* Frozen: Bed */}
                  <td className={`${stickyCell} left-0 w-16 px-3 py-3`}>
                    <span className="nums rounded-md bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--color-accent)]">
                      {bed.label}
                    </span>
                  </td>

                  {/* Frozen: Client — shadow marks freeze boundary */}
                  <td
                    className={`${stickyCell} relative left-16 min-w-[168px] px-3 py-3 shadow-[2px_0_6px_rgba(0,0,0,0.05)] ${
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

                  {/* Task cells */}
                  {COLUMNS.map((col) => (
                    <TaskCell key={col.code} bed={bed} code={col.code} />
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
          What the icons and colours mean
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5 text-[12px] text-[var(--color-ink)]">
          {(
            [
              { icon: '✓', tone: 'good'    as Tone, label: 'Done — this task has been completed'              },
              { icon: '▲', tone: 'alert'   as Tone, label: 'Overdue — this task was due and has not been done' },
              { icon: '●', tone: 'warn'    as Tone, label: 'Due today — this task must be done today'          },
              { icon: '—', tone: 'neutral' as Tone, label: 'Still to come — not due yet'                       },
            ] satisfies Array<{ icon: string; tone: Tone; label: string }>
          ).map(({ icon, tone, label }) => (
            <div key={label} className="flex items-center gap-2">
              <Chip icon={icon} label="" tone={tone} />
              {label}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--color-ink-muted)]">×</span>
            Not applicable — this task is not part of this programme
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-red-500" />
            Red dot — safeguarding concern flagged for this client
          </div>
        </div>
      </div>

    </div>
  );
}
