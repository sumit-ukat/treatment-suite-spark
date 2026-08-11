import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Printer, Search } from 'lucide-react';
import { buildRealBoard } from './real-board-data.js';
import type { BoardBed } from './board-data.js';

// ─── Column definitions ──────────────────────────────────────────────────────

const COLUMNS = [
  { code: 'family_contact_24h',          label: '24h',       full: '24-hour family contact',              group: 'family'    },
  { code: 'family_contact_week_1',        label: 'Week 1',    full: 'Week 1 family contact',               group: 'family'    },
  { code: 'family_contact_week_2',        label: 'Week 2',    full: 'Week 2 family contact',               group: 'family'    },
  { code: 'family_contact_pre_discharge', label: 'Pre-D',     full: 'Family contact 24h before discharge', group: 'family'    },
  { code: 'satisfaction_survey_7day',     label: '7-day',     full: '7-day satisfaction survey',           group: 'survey'    },
  { code: 'gp_summary',                   label: 'GP Sum.',   full: 'GP summary letter',                   group: 'medical'   },
  { code: 'life_story',                   label: 'Life Story',full: 'Life story / surrender',              group: 'milestone' },
  { code: 'step_1',                       label: 'Step 1',    full: 'Step 1',                              group: 'milestone' },
  { code: 'step_2',                       label: 'Step 2',    full: 'Step 2',                              group: 'milestone' },
  { code: 'step_3',                       label: 'Step 3',    full: 'Step 3',                              group: 'milestone' },
  { code: 'ccp',                          label: 'CCP',       full: 'CCP milestone',                       group: 'milestone' },
  { code: 'session_intro',                label: 'Intro',     full: 'Intro counselling session',           group: 'session'   },
  { code: 'session_week_1',               label: 'Week 1',    full: 'Week 1 counselling session',          group: 'session'   },
  { code: 'session_week_2',               label: 'Week 2',    full: 'Week 2 counselling session',          group: 'session'   },
  { code: 'session_week_3',               label: 'Week 3',    full: 'Week 3 counselling session',          group: 'session'   },
  { code: 'session_week_4',               label: 'Week 4',    full: 'Week 4 counselling session',          group: 'session'   },
] as const;

const COL_GROUPS = [
  { label: 'Family contact', count: 4, cls: 'bg-sky-50    text-sky-800    dark:bg-sky-950/50    dark:text-sky-300'    },
  { label: 'Survey',         count: 1, cls: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300' },
  { label: 'Medical',        count: 1, cls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  { label: 'Milestones',     count: 5, cls: 'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300' },
  { label: 'Sessions',       count: 5, cls: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Task cell ───────────────────────────────────────────────────────────────

function TaskCell({ bed, code }: { bed: BoardBed; code: string }) {
  const o = bed.occupant;
  if (!o) return <td className="w-[52px] border-b border-r border-[var(--color-line)] px-1 py-2.5 text-center text-[var(--color-ink-muted)]">—</td>;

  const task = o.tasks.find((t) => t.code === code);
  const base = 'w-[52px] border-b border-r border-[var(--color-line)] px-1 py-2.5 text-center';

  if (!task) return <td className={base}><span className="text-[var(--color-ink-muted)]">—</span></td>;

  if (task.isNotApplicable) {
    return (
      <td className={base}>
        <span className="text-[13px] text-[var(--color-ink-muted)]" title={task.notApplicableReason ?? 'Not applicable'}>×</span>
      </td>
    );
  }
  if (task.isComplete) {
    return (
      <td className={base}>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-500 text-white"
          title={task.completedBy ? `Done by ${task.completedBy}` : 'Done'}
        >
          <CheckCircle2 className="size-4" strokeWidth={2.5} />
        </span>
      </td>
    );
  }
  if (task.isOverdue) {
    return (
      <td className={base}>
        <span className="inline-flex h-7 w-7 items-center justify-center text-red-500" title="Overdue — action needed">
          <AlertTriangle className="size-5" strokeWidth={2} />
        </span>
      </td>
    );
  }
  if (task.isDueToday) {
    return (
      <td className={base}>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-white text-[10px] font-bold"
          title="Due today"
        >
          ●
        </span>
      </td>
    );
  }
  return (
    <td className={base}>
      <span
        className="text-[16px] leading-none text-[var(--color-ink-muted)]"
        title={task.dueAt ? `Due ${fmt(task.dueAt)}` : 'Not yet due'}
      >
        —
      </span>
    </td>
  );
}

// ─── Summary tile ─────────────────────────────────────────────────────────────

function Tile({
  count, label, sub, borderCls, numCls, active, onClick,
}: {
  count: number; label: string; sub: string;
  borderCls: string; numCls: string;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[140px] rounded-xl border-2 p-4 text-left transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${borderCls}`}
    >
      <div className={`font-display text-[34px] font-bold leading-none tabular-nums ${numCls}`}>{count}</div>
      <div className="mt-1.5 text-[13px] font-medium text-[var(--color-ink)]">{label}</div>
      <div className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
        {active ? 'Showing only these — click to clear' : sub}
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type FilterId = 'all' | 'overdue' | 'due_today' | 'available';

export function TreatmentBoard({
  centreId,
  centreName,
}: {
  centreId: string;
  centreName: string;
}) {
  const [beds, setBeds] = useState<readonly BoardBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');

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
  }, [centreId]);

  const counts = useMemo(() => ({
    clients:  beds.filter((b) => b.occupant).length,
    available: beds.filter((b) => !b.occupant).length,
    overdue:  beds.filter((b) => (b.occupant?.overdueCount ?? 0) > 0).length,
    dueToday: beds.filter((b) => (b.occupant?.dueTodayCount ?? 0) > 0).length,
  }), [beds]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return beds.filter((bed) => {
      if (activeFilter === 'overdue'   && (bed.occupant?.overdueCount ?? 0) === 0) return false;
      if (activeFilter === 'due_today' && (bed.occupant?.dueTodayCount ?? 0) === 0) return false;
      if (activeFilter === 'available' && bed.occupant !== null) return false;
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

  // Shared cell border class
  const cb = 'border-b border-r border-[var(--color-line)]';
  // Shared info-column header class
  const ih = `${cb} bg-[var(--color-surface)] px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.06em] uppercase text-[var(--color-ink-muted)] whitespace-nowrap`;

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6">

      {/* ── Page header ── */}
      <div>
        <h1 className="font-display text-[22px] font-bold text-[var(--color-ink)]">
          {centreName} treatment board
        </h1>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Every bed and every clinical task in one view.
            {loadedAt ? ` Last updated at ${fmtTime(loadedAt)} today.` : ''}
          </p>
          <div className="flex items-center gap-2 print:hidden">
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-[var(--color-ink-muted)]" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search client name or bed"
                className="h-9 w-[220px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] pl-8 pr-3 text-[12.5px] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[12.5px] font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-muted)]"
            >
              <Printer className="size-3.5" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary tiles ── */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <Tile
          count={counts.clients}
          label="clients on the ward"
          sub="Click to filter the board"
          borderCls="border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          numCls="text-[var(--color-accent)]"
          active={false}
          onClick={() => setActiveFilter('all')}
        />
        <Tile
          count={counts.available}
          label="beds free"
          sub="Click to filter the board"
          borderCls="border-[var(--color-line)] bg-[var(--color-surface)]"
          numCls="text-[var(--color-ink)]"
          active={activeFilter === 'available'}
          onClick={() => toggle('available')}
        />
        <Tile
          count={counts.overdue}
          label="clients with OVERDUE tasks"
          sub="Click to filter the board"
          borderCls="border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30"
          numCls="text-red-600 dark:text-red-400"
          active={activeFilter === 'overdue'}
          onClick={() => toggle('overdue')}
        />
        <Tile
          count={counts.dueToday}
          label="clients with tasks DUE TODAY"
          sub="Click to filter the board"
          borderCls="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
          numCls="text-amber-600 dark:text-amber-400"
          active={activeFilter === 'due_today'}
          onClick={() => toggle('due_today')}
        />
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
        <table className="min-w-max border-separate border-spacing-0 text-[12.5px]">

          <thead className="sticky top-0 z-20">
            {/* Row 1 — category group headers */}
            <tr>
              <th
                colSpan={8}
                className="sticky left-0 z-30 border-b border-r border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2.5 text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-[var(--color-ink-muted)]"
              >
                Client &amp; Placement
              </th>
              {COL_GROUPS.map((g) => (
                <th
                  key={g.label}
                  colSpan={g.count}
                  className={`border-b border-r border-[var(--color-line)] px-2 py-2.5 text-center text-[10px] font-bold tracking-[0.06em] uppercase ${g.cls}`}
                >
                  {g.label}
                </th>
              ))}
            </tr>

            {/* Row 2 — individual column headers */}
            <tr>
              {/* Frozen: Bed */}
              <th className={`sticky left-0 z-30 w-16 border-b-2 ${ih}`}>Bed</th>
              {/* Frozen: Client — shadow marks the freeze boundary */}
              <th className={`sticky left-16 z-30 min-w-[168px] border-b-2 ${ih} shadow-[2px_0_6px_rgba(0,0,0,0.07)]`}>Client</th>
              <th className={`border-b-2 ${ih}`}>Status</th>
              <th className={`border-b-2 ${ih}`}>Day</th>
              <th className={`border-b-2 ${ih}`}>Admitted</th>
              <th className={`border-b-2 ${ih}`}>Discharge</th>
              <th className={`border-b-2 ${ih}`}>Group</th>
              <th className={`border-b-2 ${ih}`}>Therapist</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.code}
                  title={col.full}
                  className={`w-[52px] border-b-2 border-r border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-2.5 text-center text-[9.5px] font-semibold tracking-[0.04em] uppercase text-[var(--color-ink-muted)]`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visible.map((bed, i) => {
              const o = bed.occupant;
              const stripe = i % 2 !== 0 ? 'bg-[var(--color-surface)]/60' : '';
              const stickyBase = `sticky z-10 ${i % 2 !== 0 ? 'bg-[var(--color-surface)]/60' : 'bg-[var(--color-panel)]'}`;

              /* ── Empty bed ── */
              if (!o) {
                return (
                  <tr key={bed.label} className={`opacity-50 ${stripe}`}>
                    <td className={`${stickyBase} left-0 w-16 ${cb} px-4 py-3 font-bold text-[var(--color-ink-muted)]`}>
                      {bed.label}
                    </td>
                    <td className={`${stickyBase} left-16 min-w-[168px] ${cb} px-4 py-3 italic text-[var(--color-ink-muted)] shadow-[2px_0_6px_rgba(0,0,0,0.05)]`}>
                      Available — no client in this bed
                    </td>
                    <td className={`${cb} px-3 py-3`}>
                      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                        Available
                      </span>
                    </td>
                    {Array.from({ length: 5 + COLUMNS.length }).map((_, idx) => (
                      <td key={idx} className={`${cb} px-3 py-3 text-[var(--color-ink-muted)]`}>—</td>
                    ))}
                  </tr>
                );
              }

              /* ── Occupied bed ── */
              const badge =
                o.overdueCount > 0
                  ? { label: 'OVERDUE',   cls: 'bg-red-600  text-white' }
                  : o.dueTodayCount > 0
                    ? { label: 'DUE TODAY', cls: 'bg-amber-500 text-white' }
                    : { label: 'ON TRACK',  cls: 'bg-teal-600  text-white' };

              const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));
              const urgentDischarge = o.daysUntilDischarge <= 2;

              return (
                <tr key={bed.label} className={`transition-colors hover:bg-[var(--color-accent-soft)]/20 ${stripe}`}>

                  {/* Frozen: Bed label */}
                  <td className={`${stickyBase} left-0 w-16 ${cb} px-4 py-3 text-[13px] font-bold text-[var(--color-accent)]`}>
                    {bed.label}
                  </td>

                  {/* Frozen: Client name */}
                  <td className={`${stickyBase} left-16 min-w-[168px] ${cb} px-4 py-3 shadow-[2px_0_6px_rgba(0,0,0,0.05)]`}>
                    <div className="flex items-start gap-1.5">
                      {o.hasRestrictedAlert && (
                        <span className="mt-0.5 size-2 shrink-0 rounded-full bg-red-500" title="Safeguarding alert" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-semibold text-[var(--color-ink)]">{o.displayName}</span>
                          {o.hasRestrictedAlert && (
                            <span className="shrink-0 rounded bg-red-100 px-1 py-px text-[9px] font-bold uppercase text-red-700 dark:bg-red-900/40 dark:text-red-400">
                              Alert
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-[var(--color-ink-muted)]">{o.reference}</div>
                      </div>
                    </div>
                  </td>

                  {/* Status badge */}
                  <td className={`${cb} px-3 py-3`}>
                    <span className={`inline-flex items-center rounded px-2 py-1 text-[10.5px] font-bold tracking-wide ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>

                  {/* Treatment day + progress bar */}
                  <td className={`${cb} px-3 py-3 whitespace-nowrap`}>
                    <div className="text-[12.5px]">
                      Day <span className="font-semibold">{o.treatmentDay}</span> of {o.durationDays}
                    </div>
                    <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-[var(--color-line)]">
                      <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
                    </div>
                  </td>

                  {/* Admitted */}
                  <td className={`${cb} px-3 py-3 whitespace-nowrap text-[var(--color-ink-muted)]`}>
                    {fmt(o.admittedAt)}
                  </td>

                  {/* Planned discharge */}
                  <td
                    className={`${cb} px-3 py-3 whitespace-nowrap ${
                      urgentDischarge ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--color-ink-muted)]'
                    }`}
                  >
                    {fmtStr(o.plannedDischargeDate)}
                  </td>

                  {/* Group */}
                  <td className={`${cb} px-3 py-3 text-center text-[var(--color-ink-muted)]`}>
                    {o.group || '—'}
                  </td>

                  {/* Therapist */}
                  <td className={`${cb} px-3 py-3 whitespace-nowrap`}>
                    {o.therapist ? (
                      <span className="text-[var(--color-ink)]">{o.therapist}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                        <AlertTriangle className="size-3" /> No therapist yet
                      </span>
                    )}
                  </td>

                  {/* One cell per task */}
                  {COLUMNS.map((col) => (
                    <TaskCell key={col.code} bed={bed} code={col.code} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Legend ── */}
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 print:mt-4">
        <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          What the icons and colours mean
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2.5 text-[12px] text-[var(--color-ink)]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
              <CheckCircle2 className="size-3.5" strokeWidth={2.5} />
            </span>
            Done — this task has been completed
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-red-500" />
            Overdue — this task was due and has not been done
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
              ●
            </span>
            Due today — this task must be done today
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-[16px] leading-none text-[var(--color-ink-muted)]">—</span>
            Still to come — not due yet
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-[13px] text-[var(--color-ink-muted)]">×</span>
            Not applicable — this task is not part of this programme
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full bg-red-500" />
            Red dot and &ldquo;Alert&rdquo; — a safeguarding concern is flagged for this client
          </div>
        </div>
      </div>

    </div>
  );
}
