import { useMemo, useState } from 'react';
import {
  BedDouble,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  RefreshCw,
  TrendingUp,
  UserX,
  Repeat2,
  type LucideIcon,
} from 'lucide-react';
import { useBoardData } from './use-board-data.js';
import { summarise } from './board-data.js';
import type { BoardBed, Occupant } from './board-data.js';
import { formatDate } from '../../lib/format.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(n: number, total: number) {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

function urgencyColour(days: number): string {
  if (days < 0) return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
  if (days <= 2)  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
}

function dayLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d past date`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days}d`;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiTile({
  icon: Icon,
  value,
  label,
  sub,
  accent,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  sub?: string;
  accent?: 'green' | 'amber' | 'red' | 'neutral';
}) {
  const iconColour =
    accent === 'red'    ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' :
    accent === 'amber'  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' :
    accent === 'green'  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' :
                          'bg-[var(--color-accent-soft)] text-[var(--color-accent)]';
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
      <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${iconColour}`}>
        <Icon className="size-4" />
      </div>
      <div>
        <p className="nums text-[28px] font-bold leading-none tracking-tight">{value}</p>
        <p className="mt-1 text-[12px] font-medium text-[var(--color-ink)]">{label}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{sub}</p> : null}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold tracking-[0.07em] text-[var(--color-ink-muted)] uppercase">
      {children}
    </h2>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function StakeholderDashboard({
  centreId,
  centreName,
}: {
  centreId: string;
  centreName: string;
}) {
  const { beds, loading, refreshing, loadedAt, refresh } = useBoardData(centreId);

  const stats = useMemo(() => summarise(beds), [beds]);

  const occupants: Occupant[] = useMemo(
    () => beds.flatMap((b: BoardBed) => (b.occupant ? [b.occupant] : [])),
    [beds],
  );

  const leavingSoon = useMemo(
    () =>
      beds
        .filter((b) => b.occupant && b.occupant.daysUntilDischarge >= -1 && b.occupant.daysUntilDischarge <= 7)
        .map((b) => ({ bed: b, o: b.occupant! }))
        .sort((a, b) => a.o.daysUntilDischarge - b.o.daysUntilDischarge),
    [beds],
  );

  const needsAttention = useMemo(
    () =>
      beds
        .filter((b) => b.occupant && (b.occupant.hasRestrictedAlert || b.occupant.overdueCount > 0))
        .map((b) => ({ bed: b, o: b.occupant! }))
        .sort((a, b) => {
          if (a.o.hasRestrictedAlert !== b.o.hasRestrictedAlert) return a.o.hasRestrictedAlert ? -1 : 1;
          return b.o.overdueCount - a.o.overdueCount;
        }),
    [beds],
  );

  const [activeTab, setActiveTab] = useState<'graduating' | 'attention'>('attention');

  const totalTasks   = occupants.reduce((s, o) => s + o.totalCount, 0);
  const totalNA      = occupants.reduce((s, o) => s + o.notApplicableCount, 0);
  const totalDone    = occupants.reduce((s, o) => s + o.completedCount, 0);
  const completionPct = pct(totalDone, totalTasks - totalNA);

  const extendedStays  = occupants.filter((o) => o.isExtendedStay).length;
  const openConcerns   = occupants.filter((o) => o.hasOpenConcern).length;
  const pendingD       = occupants.filter((o) => o.dischargeRequest !== null).length;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-ink-muted)]">
        Loading overview…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[20px] font-semibold">{centreName} — Overview</h1>
          <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-muted/60 disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {loadedAt ? `Updated ${loadedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Refresh'}
        </button>
      </div>

      {/* ── Primary KPIs ── */}
      <div>
        <SectionTitle>At a glance</SectionTitle>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <KpiTile
            icon={BedDouble}
            value={`${stats.bedsOccupied}/${stats.bedsTotal}`}
            label="Beds occupied"
            sub={`${stats.occupancyPercent}% occupancy · ${stats.bedsAvailable} available`}
            accent={stats.occupancyPercent >= 85 ? 'green' : stats.occupancyPercent >= 60 ? 'amber' : 'red'}
          />
          <KpiTile
            icon={ClipboardList}
            value={stats.overdue}
            label="Overdue tasks"
            sub={stats.dueToday > 0 ? `${stats.dueToday} more due today` : 'None due today'}
            accent={stats.overdue > 0 ? 'red' : 'green'}
          />
          <KpiTile
            icon={CalendarClock}
            value={leavingSoon.length}
            label="Graduating in 7 days"
            sub={pendingD > 0 ? `${pendingD} pending request${pendingD !== 1 ? 's' : ''}` : 'No pending requests'}
            accent={leavingSoon.length > 0 ? 'amber' : 'neutral'}
          />
        </div>
      </div>

      {/* ── Secondary KPIs ── */}
      <div>
        <SectionTitle>Programme health</SectionTitle>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile
            icon={TrendingUp}
            value={`${completionPct}%`}
            label="Task completion"
            sub={`${totalDone} of ${totalTasks - totalNA} tasks done`}
            accent={completionPct >= 80 ? 'green' : completionPct >= 50 ? 'amber' : 'red'}
          />
          <KpiTile
            icon={Repeat2}
            value={extendedStays}
            label="Extended stays"
            sub={extendedStays > 0 ? 'Stays beyond original plan' : 'All stays on original plan'}
            accent={extendedStays > 0 ? 'amber' : 'green'}
          />
          <KpiTile
            icon={UserX}
            value={stats.missingTherapist}
            label="Without therapist"
            sub="Clients with no therapist assigned"
            accent={stats.missingTherapist > 0 ? 'amber' : 'green'}
          />
          <KpiTile
            icon={CircleAlert}
            value={openConcerns}
            label="Open concerns"
            sub={openConcerns > 0 ? 'Clients with flagged concerns' : 'No open concerns'}
            accent={openConcerns > 0 ? 'amber' : 'green'}
          />
        </div>
      </div>

      {/* ── Detail sections ── */}
      <div>
        {/* Tab bar */}
        <div className="mb-4 flex border-b border-[var(--color-line)]">
          <button
            type="button"
            onClick={() => setActiveTab('graduating')}
            className={`flex items-center gap-2 border-b-2 px-4 pb-2.5 pt-1 text-[12.5px] font-medium transition ${
              activeTab === 'graduating'
                ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            Graduating within 7 days
            {leavingSoon.length > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {leavingSoon.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('attention')}
            className={`flex items-center gap-2 border-b-2 px-4 pb-2.5 pt-1 text-[12.5px] font-medium transition ${
              activeTab === 'attention'
                ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            Needs attention
            {needsAttention.length > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                {needsAttention.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'graduating' ? (
          leavingSoon.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-5 text-[12px] text-[var(--color-ink-muted)]">
              <CheckCircle2 className="size-4 text-emerald-500" />
              No graduates expected in the next 7 days.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Client</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Bed</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Therapist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]">
                  {leavingSoon.map(({ bed, o }) => (
                    <tr key={bed.label} className="bg-[var(--color-panel)] transition hover:bg-muted/40">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {o.hasRestrictedAlert ? <span title="High risk" className="size-1.5 shrink-0 rounded-full bg-red-500" /> : null}
                          <span className="font-medium text-[var(--color-ink)]">{o.displayName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-ink-muted)]">{bed.label}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex w-fit rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${urgencyColour(o.daysUntilDischarge)}`}>
                            {dayLabel(o.daysUntilDischarge)}
                          </span>
                          <span className="text-[10.5px] text-[var(--color-ink-muted)]">
                            {formatDate(new Date(o.plannedDischargeDate + 'T12:00:00Z'))}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-ink-muted)]">
                        {o.therapist ?? <span className="italic text-amber-600 dark:text-amber-400">Not assigned</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          needsAttention.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-5 text-[12px] text-[var(--color-ink-muted)]">
              <CheckCircle2 className="size-4 text-emerald-500" />
              No clients with high-risk flags or overdue tasks.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Client</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Bed</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Flags</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)] uppercase">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]">
                  {needsAttention.map(({ bed, o }) => (
                    <tr key={bed.label} className="bg-[var(--color-panel)] transition hover:bg-muted/40">
                      <td className="px-3 py-2.5 font-medium text-[var(--color-ink)]">{o.displayName}</td>
                      <td className="px-3 py-2.5 text-[var(--color-ink-muted)]">{bed.label}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {o.hasRestrictedAlert ? (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9.5px] font-bold text-red-700 uppercase dark:bg-red-900/40 dark:text-red-400">
                              High risk
                            </span>
                          ) : null}
                          {o.hasOpenConcern ? (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700 uppercase dark:bg-amber-900/40 dark:text-amber-400">
                              Concern
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {o.overdueCount > 0 ? (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                            {o.overdueCount} overdue
                          </span>
                        ) : (
                          <span className="text-[var(--color-ink-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Occupancy bar ── */}
      <div>
        <SectionTitle>Bed occupancy</SectionTitle>
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
          <div className="mb-3 flex items-center justify-between text-[12px]">
            <span className="font-medium">{stats.bedsOccupied} occupied</span>
            <span className="text-[var(--color-ink-muted)]">{stats.bedsAvailable} available</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="brand-gradient h-full rounded-full transition-all"
              style={{ width: `${stats.occupancyPercent}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-ink-muted)]">
            {stats.occupancyPercent}% of {stats.bedsTotal} beds — {stats.bedsAvailable} bed{stats.bedsAvailable !== 1 ? 's' : ''} available for new admissions
          </p>
        </div>
      </div>

    </div>
  );
}
