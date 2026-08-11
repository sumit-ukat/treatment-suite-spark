import { useEffect, useState } from 'react';
import { buildRealBoard } from './real-board-data.js';
import type { BoardBed } from './board-data.js';

const COLUMNS = [
  { code: 'family_contact_24h',         label: '24h\nFamily',    group: 'family'    },
  { code: 'family_contact_week_1',       label: 'Wk 1\nFamily',  group: 'family'    },
  { code: 'family_contact_week_2',       label: 'Wk 2\nFamily',  group: 'family'    },
  { code: 'family_contact_pre_discharge',label: 'Pre-D\nFamily', group: 'family'    },
  { code: 'satisfaction_survey_7day',    label: '7-day\nSurvey',  group: 'survey'    },
  { code: 'gp_summary',                  label: 'GP\nSummary',    group: 'medical'   },
  { code: 'life_story',                  label: 'Life\nStory',    group: 'milestone' },
  { code: 'step_1',                      label: 'Step 1',         group: 'milestone' },
  { code: 'step_2',                      label: 'Step 2',         group: 'milestone' },
  { code: 'step_3',                      label: 'Step 3',         group: 'milestone' },
  { code: 'ccp',                         label: 'CCP',            group: 'milestone' },
  { code: 'session_intro',               label: 'Intro\nSes.',    group: 'session'   },
  { code: 'session_week_1',              label: 'Wk 1\nSes.',     group: 'session'   },
  { code: 'session_week_2',              label: 'Wk 2\nSes.',     group: 'session'   },
  { code: 'session_week_3',              label: 'Wk 3\nSes.',     group: 'session'   },
  { code: 'session_week_4',              label: 'Wk 4\nSes.',     group: 'session'   },
] as const;

const COL_GROUPS = [
  { label: 'Family contact', count: 4, cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  { label: 'Survey',         count: 1, cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300' },
  { label: 'Medical',        count: 1, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { label: 'Milestones',     count: 5, cls: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  { label: 'Sessions',       count: 5, cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
] as const;

function fmtInstant(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDateStr(s: string): string {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function TaskCell({ bed, code }: { bed: BoardBed; code: string }) {
  const o = bed.occupant;
  const cellBase = 'w-[46px] border-b border-r border-[var(--color-line)] p-1 text-center';
  const chipBase = 'inline-flex h-[22px] w-[34px] items-center justify-center rounded text-[11px]';

  if (!o) return <td className={cellBase} />;

  const task = o.tasks.find((t) => t.code === code);
  if (!task) {
    return (
      <td className={cellBase}>
        <span className={`${chipBase} text-[var(--color-ink-muted)]`}>—</span>
      </td>
    );
  }
  if (task.isNotApplicable) {
    return (
      <td className={cellBase}>
        <span
          className={`${chipBase} bg-[var(--color-surface)] text-[var(--color-ink-muted)]`}
          title={task.notApplicableReason ?? 'Not applicable'}
        >
          ×
        </span>
      </td>
    );
  }
  if (task.isComplete) {
    return (
      <td className={cellBase}>
        <span
          className={`${chipBase} bg-green-100 font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400`}
          title={task.completedBy ? `Done by ${task.completedBy}` : 'Done'}
        >
          ✓
        </span>
      </td>
    );
  }
  if (task.isOverdue) {
    return (
      <td className={cellBase}>
        <span
          className={`${chipBase} bg-red-100 font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400`}
          title="Overdue"
        >
          !
        </span>
      </td>
    );
  }
  if (task.isDueToday) {
    return (
      <td className={cellBase}>
        <span
          className={`${chipBase} bg-amber-100 font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400`}
          title="Due today"
        >
          ●
        </span>
      </td>
    );
  }
  return (
    <td className={cellBase}>
      <span
        className={`${chipBase} border border-[var(--color-line)] text-[10px] text-[var(--color-ink-muted)]`}
        title={task.dueAt ? `Due ${fmtInstant(task.dueAt)}` : 'Pending'}
      >
        ·
      </span>
    </td>
  );
}

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buildRealBoard(centreId)
      .then(({ board }) => {
        if (!cancelled) { setBeds(board); setError(null); }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [centreId]);

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

  const occupied = beds.filter((b) => b.occupant).length;
  const overdueClients = beds.filter((b) => (b.occupant?.overdueCount ?? 0) > 0).length;
  const dueTodayClients = beds.filter((b) => (b.occupant?.dueTodayCount ?? 0) > 0).length;

  // Column header cell style shared between the two header rows
  const infoHdr =
    'border-b border-r border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-left text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase whitespace-nowrap';

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[18px] font-semibold">Treatment Board</h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-muted)]">
            All active clients · task status at a glance · {centreName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px]">
            <span className="font-semibold">{occupied}</span>
            <span className="text-[var(--color-ink-muted)]">clients</span>
          </div>
          {overdueClients > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
              <span className="font-bold">!</span>
              <span>
                <span className="font-semibold">{overdueClients}</span> with overdue tasks
              </span>
            </div>
          )}
          {dueTodayClients > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              <span className="font-semibold">{dueTodayClients}</span>
              <span>due today</span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
        <table className="min-w-max border-separate border-spacing-0 text-[12.5px]">
          <thead className="sticky top-0 z-20">
            {/* Row 1 — column group spans */}
            <tr>
              <th
                colSpan={8}
                className="sticky left-0 z-30 border-b border-r border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-left text-[10.5px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase"
              >
                Client &amp; Placement
              </th>
              {COL_GROUPS.map((g) => (
                <th
                  key={g.label}
                  colSpan={g.count}
                  className={`border-b border-r border-[var(--color-line)] px-2 py-2 text-center text-[10px] font-semibold tracking-[0.05em] uppercase ${g.cls}`}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            {/* Row 2 — individual column labels */}
            <tr>
              <th className={`sticky left-0 z-30 min-w-[44px] ${infoHdr}`}>Bed</th>
              <th className={`sticky left-[44px] z-30 min-w-[148px] ${infoHdr}`}>Client</th>
              <th className={infoHdr}>Status</th>
              <th className={infoHdr}>Day</th>
              <th className={infoHdr}>Admitted</th>
              <th className={infoHdr}>Discharge</th>
              <th className={infoHdr}>Grp</th>
              <th className={infoHdr}>Therapist</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.code}
                  className="w-[46px] border-b border-r border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-2 text-center text-[9.5px] font-semibold leading-tight tracking-[0.04em] text-[var(--color-ink-muted)] uppercase whitespace-pre-line"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {beds.map((bed) => {
              const o = bed.occupant;

              if (!o) {
                return (
                  <tr key={bed.label} className="opacity-35">
                    <td className="sticky left-0 z-10 min-w-[44px] border-b border-r border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2.5 font-bold text-[var(--color-accent)]">
                      {bed.label}
                    </td>
                    <td className="sticky left-[44px] z-10 border-b border-r border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2.5 text-[var(--color-ink-muted)]">
                      Available{bed.shared ? ' (shared)' : ''}
                    </td>
                    {Array.from({ length: 6 + COLUMNS.length }).map((_, i) => (
                      <td key={i} className="border-b border-r border-[var(--color-line)] px-3 py-2.5" />
                    ))}
                  </tr>
                );
              }

              const statusLabel =
                o.overdueCount > 0 ? 'Overdue' : o.dueTodayCount > 0 ? 'Due today' : 'On track';
              const statusCls =
                o.overdueCount > 0
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                  : o.dueTodayCount > 0
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
              const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));
              const isUrgentDischarge = o.daysUntilDischarge <= 2;
              const stickyRow = 'bg-[var(--color-panel)] group-hover:bg-[var(--color-surface)]';

              return (
                <tr key={bed.label} className="group transition-colors hover:bg-[var(--color-surface)]">
                  {/* Sticky: Bed label */}
                  <td
                    className={`sticky left-0 z-10 min-w-[44px] border-b border-r border-[var(--color-line)] px-3 py-2.5 ${stickyRow}`}
                  >
                    <span className="font-bold text-[var(--color-accent)]">{bed.label}</span>
                  </td>

                  {/* Sticky: Client name */}
                  <td
                    className={`sticky left-[44px] z-10 min-w-[148px] border-b border-r border-[var(--color-line)] px-3 py-2.5 ${stickyRow}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {o.hasRestrictedAlert ? (
                        <span
                          className="size-2 shrink-0 rounded-full bg-red-500"
                          title="Safeguarding alert"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[var(--color-ink)]">
                          {o.displayName}
                        </div>
                        <div className="text-[10.5px] text-[var(--color-ink-muted)]">
                          {o.reference}
                          {o.substance ? ` · ${o.substance}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="border-b border-r border-[var(--color-line)] px-3 py-2.5">
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${statusCls}`}
                    >
                      {statusLabel}
                    </span>
                  </td>

                  {/* Treatment day + progress bar */}
                  <td className="border-b border-r border-[var(--color-line)] px-3 py-2.5">
                    <div className="whitespace-nowrap">
                      <span className="font-bold">{o.treatmentDay}</span>
                      <span className="text-[var(--color-ink-muted)]">/{o.durationDays}</span>
                    </div>
                    <div className="mt-1 h-1 w-10 overflow-hidden rounded-full bg-[var(--color-line)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>

                  {/* Admitted */}
                  <td className="border-b border-r border-[var(--color-line)] px-3 py-2.5 whitespace-nowrap text-[var(--color-ink-muted)]">
                    {fmtInstant(o.admittedAt)}
                  </td>

                  {/* Planned discharge */}
                  <td
                    className={`border-b border-r border-[var(--color-line)] px-3 py-2.5 whitespace-nowrap ${
                      isUrgentDischarge
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : 'text-[var(--color-ink-muted)]'
                    }`}
                  >
                    {fmtDateStr(o.plannedDischargeDate)}
                  </td>

                  {/* Treatment group */}
                  <td className="border-b border-r border-[var(--color-line)] px-3 py-2.5 text-center text-[var(--color-ink-muted)]">
                    {o.group || '—'}
                  </td>

                  {/* Focal therapist */}
                  <td className="border-b border-r border-[var(--color-line)] px-3 py-2.5 whitespace-nowrap">
                    {o.therapist ? (
                      <span className="text-[var(--color-ink)]">{o.therapist}</span>
                    ) : (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        Unassigned
                      </span>
                    )}
                  </td>

                  {/* One cell per task column */}
                  {COLUMNS.map((col) => (
                    <TaskCell key={col.code} bed={bed} code={col.code} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-[var(--color-ink-muted)]">
        {[
          { chip: '✓', cls: 'bg-green-100 font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400', label: 'Done' },
          { chip: '!',  cls: 'bg-red-100 font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400',       label: 'Overdue' },
          { chip: '●',  cls: 'bg-amber-100 font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', label: 'Due today' },
          { chip: '·',  cls: 'border border-[var(--color-line)] text-[9px]',                                  label: 'Upcoming' },
          { chip: '×',  cls: 'bg-[var(--color-surface)]',                                                     label: 'Not applicable' },
        ].map(({ chip, cls, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={`inline-flex h-[18px] w-[26px] items-center justify-center rounded text-[10px] ${cls}`}
            >
              {chip}
            </span>
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-red-500" />
          Safeguarding alert
        </div>
      </div>
    </div>
  );
}
