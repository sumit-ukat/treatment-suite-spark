import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileWarning,
  RefreshCw,
  Stethoscope,
  TrendingUp,
  UserX,
  Repeat2,
  type LucideIcon,
} from 'lucide-react';
import {
  incidents as incidentsService,
  roomsAndBeds,
  auditEvents,
  type BedRow,
  type AuditEventRow,
} from '../../services/data-access.js';
import { actionPhrase, RECORD_NOUN } from '../administration/AuditHistory.tsx';
import { useBoardData } from './use-board-data.js';
import { summarise } from './board-data.js';
import type { BoardBed, Occupant } from './board-data.js';
import { formatDate } from '../../lib/format.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { addCalendar, calendarDaysBetween, fromZonedDateString, zonedWeekday } from '../../domain/zoned-time.js';

// TODO: same scoped simplification as real-board-data.ts — every configured centre today is
// Europe/London.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(n: number, total: number) {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

function urgencyColour(days: number): string {
  if (days < 0) return 'bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-400';
  if (days <= 2)  return 'bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-400';
  return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-400';
}

function dayLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d past date`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days}d`;
}

// ─── sub-components ───────────────────────────────────────────────────────────

/**
 * Reference's stat-card treatment: every accent colours its icon *and* its number, but only the most
 * urgent tier (red) also gets a card-level wash — a faint gradient and a tinted border — so that
 * treatment stays reserved for "this genuinely needs attention" instead of colouring every card
 * equally and losing the distinction.
 */
function KpiTile({
  icon: Icon,
  value,
  label,
  sub,
  accent,
  onClick,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  sub?: string;
  accent?: 'green' | 'amber' | 'red' | 'neutral';
  /** Only "Task completion" (a percentage, not a set of clients) has nowhere real to land — every
   * other tile links to the matching Room Board / Treatment Board filter. Omitted rather than
   * forced, so a tile with nowhere useful to go stays a plain, non-interactive summary instead of a
   * click that does nothing or dumps the reader on an unfiltered board. */
  onClick?: (() => void) | undefined;
}) {
  const iconColour =
    accent === 'red'    ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' :
    accent === 'amber'  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' :
    accent === 'green'  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' :
                          'bg-[var(--color-accent-soft)] text-[var(--color-accent)]';
  const numberColour =
    accent === 'red'    ? 'text-red-600 dark:text-red-400' :
    accent === 'amber'  ? 'text-amber-600 dark:text-amber-400' :
    accent === 'green'  ? 'text-emerald-600 dark:text-emerald-400' :
                          'text-[var(--color-ink)]';
  const cardCls =
    accent === 'red'
      ? 'border-red-200/70 bg-gradient-to-br from-red-50/70 to-[var(--color-panel)] dark:border-red-900/50 dark:from-red-950/20'
      : 'border-[var(--color-line)] bg-[var(--color-panel)]';

  const content = (
    <>
      <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${iconColour}`}>
        <Icon className="size-4" />
      </div>
      <div>
        <p className={`nums text-[28px] font-bold leading-none tracking-tight ${numberColour}`}>{value}</p>
        <p className="mt-1 text-[12px] font-medium text-[var(--color-ink)]">{label}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{sub}</p> : null}
      </div>
    </>
  );

  if (!onClick) {
    return <div className={`flex flex-col gap-3 rounded-xl border p-4 ${cardCls}`}>{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition hover:border-[var(--color-accent)]/50 hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${cardCls}`}
    >
      {content}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold tracking-[0.07em] text-[var(--color-ink-muted)] uppercase">
      {children}
    </h2>
  );
}

function PanelHeader({
  title,
  subtitle,
  linkLabel,
  onLink,
  extra,
}: {
  title: string;
  subtitle?: string;
  linkLabel?: string;
  onLink?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">
          {title}
          {extra}
        </h2>
        {subtitle ? <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{subtitle}</p> : null}
      </div>
      {linkLabel && onLink ? (
        <button
          type="button"
          onClick={onLink}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline"
        >
          {linkLabel} <ArrowRight className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Occupied/available/maintenance donut. `occupied`/`available` come from the same board data the
 * KPI tiles above use; `maintenance` is the one piece not on the board (a manual flag on the real
 * `beds` table — see roomsAndBeds.beds — that the board itself deliberately ignores, since it tracks
 * disposition, not occupancy).
 */
function OccupancyPanel({
  occupied,
  available,
  maintenance,
  total,
  roomCount,
  onOpenBoard,
}: {
  occupied: number;
  available: number;
  maintenance: number;
  total: number;
  roomCount: number;
  onOpenBoard: () => void;
}) {
  const occupiedPct = total > 0 ? (occupied / total) * 100 : 0;
  const availablePct = total > 0 ? (available / total) * 100 : 0;
  const occupancyPercent = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const gradient = `conic-gradient(var(--color-accent) 0 ${occupiedPct}%, var(--color-ontrack) ${occupiedPct}% ${occupiedPct + availablePct}%, var(--color-neutral-status) 0)`;
  const legend: Array<{ label: string; n: number; color: string }> = [
    { label: 'Occupied', n: occupied, color: 'var(--color-accent)' },
    { label: 'Available', n: available, color: 'var(--color-ontrack)' },
    { label: 'Maintenance', n: maintenance, color: 'var(--color-neutral-status)' },
  ];
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
      <PanelHeader
        title="Bed occupancy"
        subtitle="A live picture of your centre's capacity"
        linkLabel="Room Board"
        onLink={onOpenBoard}
      />
      <div className="flex flex-1 items-center gap-8 px-6 pb-6" style={{ minHeight: 170 }}>
        <div
          className="relative grid size-[140px] shrink-0 place-items-center rounded-full"
          style={{ background: gradient }}
          role="img"
          aria-label={`${occupied} occupied, ${available} available, ${maintenance} under maintenance`}
        >
          <div className="absolute inset-[13px] rounded-full bg-[var(--color-panel)]" />
          <div className="relative text-center">
            <strong className="block text-[27px] font-bold tracking-tight text-[var(--color-ink)]">
              {occupancyPercent}
              <span className="text-[15px] font-normal text-[var(--color-ink-muted)]">%</span>
            </strong>
            <small className="text-[10.5px] text-[var(--color-ink-muted)]">occupancy</small>
          </div>
        </div>
        <div className="grid flex-1 gap-3.5">
          {legend.map((row) => (
            <div key={row.label} className="flex items-center gap-2 text-[11.5px] text-[var(--color-ink)]">
              <span className="size-[7px] shrink-0 rounded-[2px]" style={{ background: row.color }} />
              {row.label}
              <strong className="ml-auto text-[12.5px] font-semibold">{row.n}</strong>
              <small className="min-w-[26px] text-right text-[11px] text-[var(--color-ink-muted)]">
                {total > 0 ? Math.round((row.n / total) * 100) : 0}%
              </small>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-2.5 text-[11px] text-[var(--color-ink-muted)]">
        <span>{total} total beds across {roomCount} room{roomCount === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[var(--color-ontrack)]" />
          {available} ready for admission
        </span>
      </div>
    </section>
  );
}

/**
 * Admissions vs. planned discharges, Monday–Sunday of the current calendar week — not a rolling
 * seven days, for the same reason `daysLeftInWeek` (board-data.ts) isn't: the shape of the week
 * shouldn't shift depending on which day someone looks at it.
 */
function MovementsPanel({
  admissionsByDay,
  dischargesByDay,
  weekLabel,
  todayIndex,
}: {
  admissionsByDay: number[];
  dischargesByDay: number[];
  weekLabel: string;
  todayIndex: number;
}) {
  const max = Math.max(4, ...admissionsByDay, ...dischargesByDay);
  const totalAdmissions = admissionsByDay.reduce((a, b) => a + b, 0);
  const totalDischarges = dischargesByDay.reduce((a, b) => a + b, 0);
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
      <PanelHeader
        title="This week's movements"
        subtitle={weekLabel}
        extra={
          <span className="ml-1 flex items-center gap-3 text-[11px] font-normal text-[var(--color-ink-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="size-[7px] rounded-[2px] bg-[var(--color-accent)]" /> Admissions
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-[7px] rounded-[2px] bg-[var(--color-accent)]/40" /> Discharges
            </span>
          </span>
        }
      />
      <div className="flex flex-1 items-end justify-around gap-1 px-6 pb-1" style={{ height: 150 }}>
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex h-full items-end gap-[3px]">
              <div
                className="w-[10px] rounded-t-[3px] bg-[var(--color-accent)]"
                style={{ height: `${Math.max(admissionsByDay[i]! > 0 ? 3 : 0, (admissionsByDay[i]! / max) * 100)}%` }}
                title={`${d}: ${admissionsByDay[i]} admission${admissionsByDay[i] === 1 ? '' : 's'}`}
              />
              <div
                className="w-[10px] rounded-t-[3px] bg-[var(--color-accent)]/40"
                style={{ height: `${Math.max(dischargesByDay[i]! > 0 ? 3 : 0, (dischargesByDay[i]! / max) * 100)}%` }}
                title={`${d}: ${dischargesByDay[i]} planned discharge${dischargesByDay[i] === 1 ? '' : 's'}`}
              />
            </div>
            <span className={`text-[11px] ${i === todayIndex ? 'font-semibold text-[var(--color-accent)]' : 'text-[var(--color-ink-muted)]'}`}>
              {d}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-2.5 text-[11px] text-[var(--color-ink-muted)]">
        <span>
          <strong className="text-[var(--color-ink)]">{totalAdmissions}</strong> admission{totalAdmissions === 1 ? '' : 's'}
          {' · '}
          <strong className="text-[var(--color-ink)]">{totalDischarges}</strong> planned discharge{totalDischarges === 1 ? '' : 's'}
        </span>
        <span>Includes planned movements</span>
      </div>
    </section>
  );
}

function AttentionRow({
  icon: Icon,
  tone,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  tone: 'red' | 'amber';
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-[var(--color-line)] px-5 py-3 text-left transition hover:bg-muted/40"
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${
          tone === 'red'
            ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
        }`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-[12px] font-medium text-[var(--color-ink)]">{title}</strong>
        <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{description}</p>
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" />
    </button>
  );
}

function emailInitials(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return initials || '?';
}

function ActivityRow({ event: e }: { event: AuditEventRow }) {
  return (
    <div className="flex items-start gap-2.5 px-5 py-2.5 text-[11.5px]">
      <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[10px] font-semibold text-[var(--color-accent)]">
        {emailInitials(e.actor_email ?? '?')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="leading-snug text-[var(--color-ink)]">
          <strong className="font-semibold">{e.actor_email}</strong> {actionPhrase(e).toLowerCase()}
        </p>
        <p className="mt-0.5 truncate text-[10.5px] text-[var(--color-ink-muted)]">
          {RECORD_NOUN[e.record_type] ?? e.record_type}
        </p>
      </div>
      <time className="shrink-0 text-[10.5px] text-[var(--color-ink-muted)]">
        {new Date(e.occurred_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </time>
    </div>
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
  const navigate = useNavigate();
  const { beds, loading, refreshing, loadedAt, refresh } = useBoardData(centreId);
  const [incidentCount, setIncidentCount] = useState<number | null>(null);
  const [bedRows, setBedRows] = useState<BedRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditEventRow[]>([]);

  useEffect(() => {
    incidentsService.count7d(centreId).then(setIncidentCount).catch(() => {});
  }, [centreId]);

  useEffect(() => {
    roomsAndBeds.beds(centreId).then(setBedRows).catch(() => {});
  }, [centreId]);

  useEffect(() => {
    auditEvents.list(150)
      .then((rows) => setAuditRows(rows.filter((r) => r.centre_id === centreId && r.actor_email !== null)))
      .catch(() => {});
  }, [centreId]);

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

  const totalTasks   = occupants.reduce((s, o) => s + o.totalCount, 0);
  const totalNA      = occupants.reduce((s, o) => s + o.notApplicableCount, 0);
  const totalDone    = occupants.reduce((s, o) => s + o.completedCount, 0);
  const completionPct = pct(totalDone, totalTasks - totalNA);

  const extendedStays  = occupants.filter((o) => o.isExtendedStay).length;
  const pendingD       = occupants.filter((o) => o.dischargeRequest !== null).length;

  const gpPendingCount = occupants.filter((o) => {
    const t = o.tasks.find((t) => t.code === 'gp_summary');
    return t && !t.isComplete && !t.isNotApplicable;
  }).length;
  const gpOverdueCount = occupants.filter((o) => {
    const t = o.tasks.find((t) => t.code === 'gp_summary');
    return t && !t.isComplete && !t.isNotApplicable && t.isOverdue;
  }).length;

  const customPendingClients = occupants.filter((o) => o.tasks.some((t) => t.isManual && !t.isComplete)).length;
  const customOverdueCount   = occupants.reduce((s, o) => s + o.tasks.filter((t) => t.isManual && !t.isComplete && t.isOverdue).length, 0);

  // `beds.status` (roomsAndBeds) is a manual maintenance/closed flag the board itself ignores (see
  // roomsAndBeds.beds' own comment) — cross-referenced here purely for the occupancy donut, matched
  // by label since both read the same `beds` table for this centre.
  const bedStatusByLabel = new Map(bedRows.map((b) => [b.label, b.status]));
  const maintenanceCount = beds.filter((b) => {
    if (b.occupant) return false;
    const status = bedStatusByLabel.get(b.label);
    return status !== undefined && status !== 'available';
  }).length;
  const availableCount = Math.max(0, stats.bedsTotal - stats.bedsOccupied - maintenanceCount);
  const roomCount = new Set(beds.map((b) => b.room)).size;

  const now = new Date();
  const weekStart = addCalendar(now, -zonedWeekday(now, TZ), 'days', TZ);
  const weekEnd = addCalendar(weekStart, 6, 'days', TZ);
  const todayIndex = zonedWeekday(now, TZ);
  const admissionsByDay = [0, 0, 0, 0, 0, 0, 0];
  const dischargesByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const o of occupants) {
    const admittedIdx = calendarDaysBetween(weekStart, o.admittedAt, TZ);
    if (admittedIdx >= 0 && admittedIdx <= 6) admissionsByDay[admittedIdx]!++;
    const dischargeIdx = calendarDaysBetween(weekStart, fromZonedDateString(o.plannedDischargeDate, TZ), TZ);
    if (dischargeIdx >= 0 && dischargeIdx <= 6) dischargesByDay[dischargeIdx]!++;
  }
  const weekLabel = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
  const attentionTotal = stats.overdue + stats.restrictedAlerts + stats.missingTherapist;

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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiTile
            icon={BedDouble}
            value={`${stats.bedsOccupied}/${stats.bedsTotal}`}
            label="Beds occupied"
            sub={`${stats.occupancyPercent}% occupancy · ${stats.bedsAvailable} available`}
            accent={stats.occupancyPercent >= 85 ? 'green' : stats.occupancyPercent >= 60 ? 'amber' : 'red'}
            onClick={() => navigate('../board')}
          />
          <KpiTile
            icon={AlertTriangle}
            value={stats.restrictedAlerts}
            label="High risk clients"
            accent={stats.restrictedAlerts > 0 ? 'red' : 'green'}
            onClick={() => navigate('../board?filter=alerts')}
          />
          <KpiTile
            icon={ClipboardList}
            value={stats.overdue}
            label="Overdue tasks"
            sub={stats.dueToday > 0 ? `${stats.dueToday} more due today` : 'None due today'}
            accent={stats.overdue > 0 ? 'red' : 'green'}
            onClick={() => navigate('../treatment-board?filter=overdue')}
          />
          <KpiTile
            icon={CalendarClock}
            value={leavingSoon.length}
            label="Graduating in 7 days"
            sub={pendingD > 0 ? `${pendingD} pending request${pendingD !== 1 ? 's' : ''}` : 'No pending requests'}
            accent={leavingSoon.length > 0 ? 'amber' : 'neutral'}
            onClick={() => navigate('../treatment-board?filter=discharge_soon')}
          />
          <KpiTile
            icon={FileWarning}
            value={incidentCount ?? '—'}
            label="Incident reports"
            sub={incidentCount === null ? 'Loading…' : incidentCount > 0 ? 'Reported in the last 7 days' : 'None in the last 7 days'}
            accent={incidentCount !== null && incidentCount > 0 ? 'red' : 'green'}
            onClick={() => navigate('../incidents')}
          />
        </div>
      </div>

      {/* ── Secondary KPIs ── */}
      <div>
        <SectionTitle>Programme health</SectionTitle>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
            onClick={() => navigate('../treatment-board?filter=extended_stay')}
          />
          <KpiTile
            icon={UserX}
            value={stats.missingTherapist}
            label="Without therapist"
            sub="Clients with no therapist assigned"
            accent={stats.missingTherapist > 0 ? 'amber' : 'green'}
            onClick={() => navigate('../treatment-board?filter=no_therapist')}
          />
          <KpiTile
            icon={Stethoscope}
            value={gpPendingCount}
            label="GP summaries pending"
            sub={
              gpOverdueCount > 0
                ? `${gpOverdueCount} overdue · due within 3 days of admission`
                : gpPendingCount > 0
                ? 'Due within 3 days of admission'
                : 'All GP summaries up to date'
            }
            accent={gpOverdueCount > 0 ? 'red' : gpPendingCount > 0 ? 'amber' : 'green'}
            onClick={() => navigate('../treatment-board?filter=gp_pending')}
          />
          <KpiTile
            icon={CheckCircle2}
            value={customPendingClients}
            label="Custom assignments"
            sub={
              customOverdueCount > 0
                ? `${customOverdueCount} overdue custom task${customOverdueCount !== 1 ? 's' : ''}`
                : customPendingClients > 0
                ? `${customPendingClients} client${customPendingClients !== 1 ? 's' : ''} with pending custom tasks`
                : 'No pending custom assignments'
            }
            accent={customOverdueCount > 0 ? 'red' : customPendingClients > 0 ? 'amber' : 'green'}
            onClick={() => navigate('../treatment-board?filter=custom_pending')}
          />
        </div>
      </div>

      {/* ── Capacity, movements, attention & activity ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OccupancyPanel
          occupied={stats.bedsOccupied}
          available={availableCount}
          maintenance={maintenanceCount}
          total={stats.bedsTotal}
          roomCount={roomCount}
          onOpenBoard={() => navigate('../board')}
        />
        <MovementsPanel
          admissionsByDay={admissionsByDay}
          dischargesByDay={dischargesByDay}
          weekLabel={weekLabel}
          todayIndex={todayIndex}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_1fr]">
        <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
          <PanelHeader
            title="Needs attention"
            linkLabel="View board"
            onLink={() => navigate('../treatment-board?filter=overdue')}
            extra={
              attentionTotal > 0 ? (
                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/25 dark:text-red-400">
                  {attentionTotal}
                </span>
              ) : null
            }
          />
          {attentionTotal === 0 ? (
            <div className="flex items-center gap-2 border-t border-[var(--color-line)] px-5 py-6 text-[12px] text-[var(--color-ink-muted)]">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              Nothing needs attention right now.
            </div>
          ) : (
            <div>
              {stats.overdue > 0 ? (
                <AttentionRow
                  icon={ClipboardList}
                  tone="red"
                  title={`${stats.overdue} overdue care action${stats.overdue === 1 ? '' : 's'}`}
                  description="Review outstanding actions with your team"
                  onClick={() => navigate('../treatment-board?filter=overdue')}
                />
              ) : null}
              {stats.restrictedAlerts > 0 ? (
                <AttentionRow
                  icon={AlertTriangle}
                  tone="red"
                  title={`${stats.restrictedAlerts} high-risk client${stats.restrictedAlerts === 1 ? '' : 's'}`}
                  description="Confirm safeguarding plans are up to date"
                  onClick={() => navigate('../board?filter=alerts')}
                />
              ) : null}
              {stats.missingTherapist > 0 ? (
                <AttentionRow
                  icon={UserX}
                  tone="amber"
                  title={`${stats.missingTherapist} client${stats.missingTherapist === 1 ? '' : 's'} without a therapist`}
                  description="Assign a therapist to keep care on track"
                  onClick={() => navigate('../treatment-board?filter=no_therapist')}
                />
              ) : null}
            </div>
          )}
        </section>

        <section className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
          <PanelHeader title="Recent activity" linkLabel="Activity log" onLink={() => navigate('../audit')} />
          <div className="flex-1 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
            {auditRows.length === 0 ? (
              <p className="px-5 py-6 text-[12px] text-[var(--color-ink-muted)]">No recent activity for this centre.</p>
            ) : (
              auditRows.slice(0, 5).map((e) => <ActivityRow key={e.id} event={e} />)
            )}
          </div>
        </section>
      </div>

      {/* ── Graduating within 7 days ── */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.07em] text-[var(--color-ink-muted)] uppercase">
            Graduating within 7 days
          </h2>
          {leavingSoon.length > 0 && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-900/25 dark:text-amber-300">
              {leavingSoon.length}
            </span>
          )}
        </div>
        {leavingSoon.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-5 text-[12px] text-[var(--color-ink-muted)]">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
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
                  <tr
                    key={bed.label}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`../board?bed=${encodeURIComponent(bed.label)}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`../board?bed=${encodeURIComponent(bed.label)}`); } }}
                    title={`Open ${o.displayName}'s client file`}
                    className="cursor-pointer bg-[var(--color-panel)] transition hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
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
        )}
      </div>

    </div>
  );
}
