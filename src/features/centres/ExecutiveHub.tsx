import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowUpRight,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock,
  FileWarning,
  LogOut,
  Percent,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UserMinus,
  UserX,
  Users,
} from 'lucide-react';
import { buildCentres, groupTotals, occupancyExtremes, type CentreSummary } from './centres-data.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { daysLeftInWeek } from '../../domain/zoned-time.js';
import { formatDate } from '../../lib/format.js';
import { Panel } from '../../components/ui.tsx';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.tsx';

// Same scoped simplification as elsewhere — every configured centre today is Europe/London.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

/**
 * Executive group hub — the stakeholder read of the estate.
 *
 * A second hub rather than a replacement, so the two can be compared side by side before either is
 * committed to. Where the operational hub answers *"what do I do next"* — a manager's list of centres
 * to work through — this one answers *"is the estate running properly, and if not, where"*. That
 * difference drives every choice below:
 *
 * - **One verdict, stated in words.** A stakeholder should not have to add up six counters to learn
 *   whether things are fine. The headline is a sentence, and the numbers underneath explain it.
 * - **Exceptions are the content, not a column.** Centres that are fine collapse into a count; only
 *   the ones needing something get named, ranked, with the reason spelled out.
 * - **Commercial and operational risk are kept apart.** Unfilled beds and overdue actions are both
 *   worth a stakeholder's attention but lead to different conversations, so they get separate panels
 *   rather than one blended "score".
 * - **No trend arrows.** Nothing here is stored historically yet, so a delta would have to be
 *   invented. The footnote says so rather than the page implying a direction it cannot know.
 */

/* ─────────────────────────── health model ─────────────────────────── */

type Health = 'clear' | 'watch' | 'act';

/**
 * Thresholds are stated as named constants and repeated back to the reader in the page footnote,
 * because a stakeholder metric nobody can explain is worse than no metric — the first question in the
 * room is always "what counts as needing action?"
 */
const OVERDUE_ACT = 8;
const ONTIME_ACT = 80;
const PHOTO_WATCH = 2;

interface Assessment {
  centre: CentreSummary;
  health: Health;
  /** Plain-English, most severe first. Empty when clear. */
  reasons: readonly string[];
  /** Ranking weight within the watchlist — never shown, only used to order. */
  severity: number;
}

function assess(c: CentreSummary): Assessment {
  const reasons: string[] = [];
  let severity = 0;
  let act = false;

  // A resident still in a bed past their planned discharge date outranks everything else here: it is
  // the one item that is simultaneously a care question, a capacity question and a billing question.
  if (c.pastPlannedDischarge > 0) {
    reasons.push(
      `${c.pastPlannedDischarge} resident${c.pastPlannedDischarge === 1 ? '' : 's'} past planned discharge`,
    );
    severity += 1000 * c.pastPlannedDischarge;
    act = true;
  }

  if (c.overdue > 0) {
    reasons.push(`${c.overdue} overdue action${c.overdue === 1 ? '' : 's'}`);
    severity += 10 * c.overdue;
    if (c.overdue >= OVERDUE_ACT) act = true;
  }

  if (c.onTimePercent < ONTIME_ACT) {
    reasons.push(`${c.onTimePercent}% completed on time`);
    severity += 4 * (ONTIME_ACT - c.onTimePercent);
    act = true;
  }

  if (c.photoAttention > PHOTO_WATCH) {
    reasons.push(`${c.photoAttention} client photos missing`);
    severity += c.photoAttention;
  }

  const health: Health = act ? 'act' : reasons.length > 0 ? 'watch' : 'clear';
  return { centre: c, health, reasons, severity };
}

const HEALTH_STYLE: Record<Health, { label: string; text: string; soft: string; dot: string; line: string }> = {
  clear: { label: 'Clear', text: 'text-ontrack', soft: 'bg-ontrack-soft', dot: 'bg-ontrack', line: 'border-ontrack/40' },
  watch: { label: 'Watch', text: 'text-attention', soft: 'bg-attention-soft', dot: 'bg-attention', line: 'border-attention/50' },
  act: { label: 'Action', text: 'text-overdue', soft: 'bg-overdue-soft', dot: 'bg-overdue', line: 'border-overdue/60' },
};

/* ─────────────────────────── small parts ─────────────────────────── */

/**
 * The occupancy ring. Purple because occupancy is a magnitude, not a status — the palette reserves
 * the three status hues for things that are actually good or bad, and a full house is neither on its
 * own. The verdict beside it carries the status colour instead.
 */
function OccupancyRing({ percent }: { percent: number }) {
  const size = 148;
  const stroke = 13;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="tabular font-display text-[34px] leading-none font-semibold">
            {percent}
            <span className="text-[19px] text-muted-foreground">%</span>
          </p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
            Occupied
          </p>
        </div>
      </div>
    </div>
  );
}

/** A headline figure inside the hero band — flatter than MetricCard, because the band is the card. */
function HeroStat({
  label,
  value,
  suffix,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  suffix?: string | undefined;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span aria-hidden>{icon}</span>
        <p className="truncate text-[10.5px] font-semibold tracking-[0.08em] uppercase">{label}</p>
      </div>
      <p className="tabular mt-1.5 font-display text-[27px] leading-none font-semibold">
        {value}
        {suffix ? <span className="text-[17px] text-muted-foreground">{suffix}</span> : null}
      </p>
      <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Compact bar used in the estate list — no inline label, since the row already prints the numbers. */
function MiniBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

type MetricAccent = 'critical' | 'warn' | 'good' | 'neutral';

interface MetricCardSpec {
  label: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  accent: MetricAccent;
}

/** Shared rendering for the business and ops card rows — same visual language, different data. */
function MetricGrid({ cards }: { cards: readonly MetricCardSpec[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(({ label, value, hint, icon, accent }) => {
        const topBar =
          accent === 'critical'
            ? 'bg-overdue'
            : accent === 'warn'
              ? 'bg-attention'
              : accent === 'good'
                ? 'bg-ontrack'
                : 'bg-border';
        const numColor =
          accent === 'critical'
            ? 'text-overdue'
            : accent === 'warn'
              ? 'text-attention'
              : 'text-foreground';
        return (
          <div
            key={label}
            className="relative overflow-hidden rounded-2xl border border-[var(--color-line)] bg-card p-4 shadow-soft"
          >
            <div className={`absolute inset-x-0 top-0 h-1 ${topBar}`} aria-hidden />
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                {label}
              </p>
              <span className="text-muted-foreground">{icon}</span>
            </div>
            <p className={`tabular mt-3 font-display text-[30px] leading-none font-semibold ${numColor}`}>
              {value}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── the hub ─────────────────────────── */

type SortKey = 'risk' | 'occupancy' | 'name';

export function ExecutiveHub({ onOpenCentre }: { onOpenCentre: (slug: string) => void }) {
  const centres = useMemo(() => buildCentres(), []);

  /**
   * Two ways to narrow, deliberately mutually exclusive: picking a region clears the manual picks and
   * vice versa. Intersecting them would let a reader select three northern centres, switch to South,
   * and land on an empty page that is technically correct and completely unhelpful.
   */
  const [region, setRegionState] = useState<'all' | 'North' | 'South'>('all');
  const [picked, setPickedState] = useState<readonly string[]>([]);
  const [sort, setSort] = useState<SortKey>('risk');
  const [capacitySort, setCapacitySort] = useState<'occ-asc' | 'occ-desc' | 'name' | 'region'>('occ-asc');

  const setRegion = (r: 'all' | 'North' | 'South') => {
    setRegionState(r);
    setPickedState([]);
  };
  const togglePick = (slug: string) => {
    setRegionState('all');
    setPickedState((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  // Unlike the operational hub — where the region control filters only the list — every figure on this
  // page is computed from the scoped set. A stakeholder narrowing to one region is asking about that
  // region's numbers, not asking to scroll a shorter list under unchanged group totals.
  const visible = useMemo(
    () =>
      centres.filter(
        (c) => (region === 'all' || c.region === region) && (picked.length === 0 || picked.includes(c.slug)),
      ),
    [centres, region, picked],
  );

  const totals = useMemo(() => groupTotals(visible), [visible]);
  const assessed = useMemo(() => visible.map(assess), [visible]);
  const extremes = useMemo(() => occupancyExtremes(visible), [visible]);

  const needAction = assessed.filter((a) => a.health === 'act');
  const watching = assessed.filter((a) => a.health === 'watch');
  const clear = assessed.filter((a) => a.health === 'clear');
  const watchlist = [...needAction, ...watching].sort((a, b) => b.severity - a.severity);

  const scopeLabel =
    picked.length > 0
      ? picked.length === 1
        ? (visible[0]?.name ?? '1 centre')
        : `${picked.length} centres`
      : region === 'all'
        ? 'All centres'
        : `${region} region`;

  /** Names the window rather than leaving "this week" to interpretation. */
  const weekHint = useMemo(() => {
    const now = new Date();
    const left = daysLeftInWeek(now, TZ);
    if (left === 0) return 'Today — last day of the week';
    const sunday = new Date(now);
    sunday.setDate(sunday.getDate() + left);
    return `Today to Sun ${formatDate(sunday)}`;
  }, []);

  // The verdict. Ordered so the best case is the shortest sentence — a stakeholder who reads only the
  // first line of this page should still learn the right thing.
  const verdict = (() => {
    if (visible.length === 0) {
      return { tier: 'clear' as Health, headline: 'Nothing in scope', detail: 'No centre matches the current selection.' };
    }
    if (needAction.length === 0 && watching.length === 0) {
      return {
        tier: 'clear' as Health,
        headline: 'Running clean',
        detail: `All ${visible.length} centre${visible.length === 1 ? '' : 's'} clear — nothing overdue, nothing past its discharge date.`,
      };
    }
    if (needAction.length === 0) {
      return {
        tier: 'watch' as Health,
        headline: 'Operating normally',
        detail: `${clear.length} of ${visible.length} centres clear. ${watching.length} with minor items in hand — nothing at the level that needs a decision here.`,
      };
    }
    return {
      tier: 'act' as Health,
      headline:
        needAction.length === 1
          ? 'One centre needs attention'
          : `${needAction.length} centres need attention`,
      detail: `${clear.length + watching.length} of ${visible.length} running normally. ${needAction.length === 1 ? 'The exception is' : 'The exceptions are'} named below.`,
    };
  })();

  const vStyle = HEALTH_STYLE[verdict.tier];

  // Group average is a real benchmark derived from the scoped set — unlike an occupancy "target",
  // which has not been supplied and would be invented if it appeared here.
  const avgOccupancy = totals.occupancyPercent;
  const capacitySorted = useMemo(
    () =>
      [...visible].sort((a, b) => {
        switch (capacitySort) {
          case 'occ-asc':  return a.occupancyPercent - b.occupancyPercent;
          case 'occ-desc': return b.occupancyPercent - a.occupancyPercent;
          case 'name':     return a.name.localeCompare(b.name);
          case 'region':
            return a.region !== b.region
              ? a.region.localeCompare(b.region)
              : a.name.localeCompare(b.name);
        }
      }),
    [visible, capacitySort],
  );
  const capacityHalf  = Math.ceil(capacitySorted.length / 2);
  const capacityLeft  = capacitySorted.slice(0, capacityHalf);
  const capacityRight = capacitySorted.slice(capacityHalf);

  const sorted = [...assessed].sort((a, b) => {
    switch (sort) {
      case 'occupancy':
        return b.centre.occupancyPercent - a.centre.occupancyPercent;
      case 'name':
        return a.centre.name.localeCompare(b.centre.name);
      case 'risk':
        return b.severity - a.severity || a.centre.name.localeCompare(b.centre.name);
    }
  });

  const regionRollup = (['South', 'North'] as const)
    .map((r) => {
      const inRegion = centres.filter((c) => c.region === r);
      return { region: r, totals: groupTotals(inRegion), count: inRegion.length, assessed: inRegion.map(assess) };
    })
    .filter((r) => r.count > 0);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5">
      {/* ── Scope. At the top because it governs every number below it; the old hub buries the
             equivalent control halfway down beside a list it only partly affects. ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold tracking-[0.14em] text-primary uppercase">
            Executive summary
          </p>
          <h1 className="mt-0.5 truncate font-display text-2xl font-semibold sm:text-[27px]">
            {scopeLabel}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[var(--color-line)] bg-card p-0.5">
            {(['all', 'South', 'North'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  region === r && picked.length === 0
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r === 'all' ? 'Whole group' : r}
              </button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-card px-2.5 text-[12.5px] font-medium transition hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                {picked.length > 0 ? `${picked.length} picked` : 'Pick centres'}
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-auto">
              <DropdownMenuLabel>Compare specific centres</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[...centres]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.slug}
                    checked={picked.includes(c.slug)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => togglePick(c.slug)}
                  >
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{c.region}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              {picked.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setPickedState([])}>Clear selection</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── The verdict band. One sentence, then the four numbers that justify it. ── */}
      <section
        aria-label="Group verdict"
        className={`mt-4 overflow-hidden rounded-2xl border bg-card shadow-soft ${vStyle.line}`}
      >
        <div className="grid gap-5 p-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-7 lg:p-6">
          <div className="flex items-center gap-5">
            <OccupancyRing percent={totals.occupancyPercent} />
            <div className="min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${vStyle.line} ${vStyle.soft} ${vStyle.text}`}
              >
                {verdict.tier === 'clear' ? (
                  <CheckCircle2 className="size-3.5" aria-hidden />
                ) : verdict.tier === 'watch' ? (
                  <TriangleAlert className="size-3.5" aria-hidden />
                ) : (
                  <CircleAlert className="size-3.5" aria-hidden />
                )}
                {HEALTH_STYLE[verdict.tier].label}
              </span>
              <h2 className="mt-2 font-display text-[23px] leading-tight font-semibold sm:text-[26px]">
                {verdict.headline}
              </h2>
              <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
                {verdict.detail}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-[var(--color-line)] pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
            <HeroStat
              label="Highest occupied (3-mo avg)"
              value={extremes ? extremes.highest.avgOccupancy3MonthPercent : '—'}
              {...(extremes ? { suffix: '%' } : {})}
              hint={extremes ? extremes.highest.name : 'Nothing in scope'}
              icon={<TrendingUp className="size-3.5" />}
            />
            <HeroStat
              label="Lowest occupied (3-mo avg)"
              value={extremes ? extremes.lowest.avgOccupancy3MonthPercent : '—'}
              {...(extremes ? { suffix: '%' } : {})}
              hint={extremes ? extremes.lowest.name : 'Nothing in scope'}
              icon={<TrendingDown className="size-3.5" />}
            />
          </div>
        </div>
      </section>

      {/* ── Business health — the commercial picture: census, capacity, pipeline. Kept apart from
             ops so a reader can ask "are we full and running well commercially" without the clinical
             risk numbers competing for attention in the same row. ── */}
      <div className="mt-4">
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Business health
        </h2>
        <MetricGrid
          cards={[
            {
              label: 'In treatment',
              value: totals.occupied,
              hint: `across ${visible.length} centre${visible.length === 1 ? '' : 's'}`,
              icon: <Users className="size-4" />,
              accent: 'neutral',
            },
            {
              label: 'Free beds',
              value: totals.available,
              hint: `of ${totals.capacity} total`,
              icon: <BedDouble className="size-4" />,
              accent: totals.available < 5 ? 'warn' : 'neutral',
            },
            {
              label: 'Bed utilisation',
              value: `${totals.occupancyPercent}%`,
              hint: 'average across scope',
              icon: <Percent className="size-4" />,
              accent: totals.occupancyPercent >= 85 ? 'good' : 'neutral',
            },
            {
              label: 'Extended stays',
              value: totals.extendedStays,
              hint: 'clients on approved extensions',
              icon: <CalendarCheck className="size-4" />,
              accent: totals.extendedStays > 8 ? 'warn' : 'neutral',
            },
            {
              label: 'Discharging',
              value: totals.dischargingThisWeek,
              hint: 'planned this week',
              icon: <ArrowUpRight className="size-4" />,
              accent: 'neutral',
            },
            {
              label: 'Unplanned exits',
              value: totals.unplannedExits,
              hint: 'early or AMA departures',
              icon: <LogOut className="size-4" />,
              accent: totals.unplannedExits > 3 ? 'critical' : totals.unplannedExits > 0 ? 'warn' : 'good',
            },
          ]}
        />
      </div>

      {/* ── Ops health — the clinical and compliance risk picture. Ordered by urgency: issues first,
             then chronic backlog, then the two staffing-coverage gaps, then the two counts that need
             the least immediate reaction. ── */}
      <div className="mt-4">
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Ops health
        </h2>
        <MetricGrid
          cards={[
            {
              label: 'Open issues',
              value: totals.overdue + totals.pastPlannedDischarge,
              hint: `${totals.pastPlannedDischarge} past discharge · ${totals.overdue} overdue`,
              icon: <CircleAlert className="size-4" />,
              accent:
                totals.pastPlannedDischarge > 0 || totals.overdue >= OVERDUE_ACT
                  ? 'critical'
                  : totals.overdue > 0
                    ? 'warn'
                    : 'good',
            },
            {
              label: 'Issues >7 days',
              value: totals.agedOverdue,
              hint: 'unresolved for over a week',
              icon: <Clock className="size-4" />,
              accent:
                totals.agedOverdue > 10
                  ? 'critical'
                  : totals.agedOverdue > 0
                    ? 'warn'
                    : 'good',
            },
            {
              label: 'No therapist',
              value: totals.missingTherapist,
              hint: 'clients without assigned therapist',
              icon: <UserX className="size-4" />,
              accent:
                totals.missingTherapist > 5
                  ? 'critical'
                  : totals.missingTherapist > 0
                    ? 'warn'
                    : 'good',
            },
            {
              label: 'No buddy',
              value: totals.missingBuddy,
              hint: 'clients without assigned buddy',
              icon: <UserMinus className="size-4" />,
              accent:
                totals.missingBuddy > 5
                  ? 'critical'
                  : totals.missingBuddy > 0
                    ? 'warn'
                    : 'good',
            },
            {
              label: 'Incident reports',
              value: totals.incidentReports7Days,
              hint: 'reported in the last 7 days',
              icon: <FileWarning className="size-4" />,
              accent: totals.incidentReports7Days > 5 ? 'critical' : totals.incidentReports7Days > 0 ? 'warn' : 'good',
            },
            {
              label: 'On-time rate',
              value: `${totals.onTimePercent}%`,
              hint: 'actions completed to plan',
              icon: <TrendingUp className="size-4" />,
              accent:
                totals.onTimePercent < ONTIME_ACT
                  ? 'critical'
                  : totals.onTimePercent < 90
                    ? 'warn'
                    : 'good',
            },
          ]}
        />
      </div>

      {/* ── Capacity — 3rd, after the business health cards. ── */}
      <div className="mt-4">
        <Panel
          title="Capacity"
          subtitle="Where the empty beds are"
          titleExtra={
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-card px-2.5 py-1.5 text-[12px] font-medium">
              Sort:
              <select
                value={capacitySort}
                onChange={(e) => setCapacitySort(e.target.value as 'occ-asc' | 'occ-desc' | 'name' | 'region')}
                className="cursor-pointer appearance-none bg-transparent text-[12px] font-medium"
              >
                <option value="occ-asc">Most free beds</option>
                <option value="occ-desc">Highest occupancy</option>
                <option value="name">A–Z by name</option>
                <option value="region">By region</option>
              </select>
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            </label>
          }
        >
          {/* Summary stats row */}
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <div className="min-w-[180px] flex-1">
              <div className="flex items-baseline gap-2">
                <p className="tabular font-display text-[34px] leading-none font-semibold">
                  {totals.available}
                </p>
                <span className="text-[13px] text-muted-foreground">free of {totals.capacity}</span>
                <span className="ml-auto tabular text-[12px] text-muted-foreground">{avgOccupancy}% avg</span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700"
                  style={{ width: `${totals.occupancyPercent}%` }}
                />
              </div>
            </div>

            <div className="flex gap-8">
              <div>
                <p className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Freeing this week
                </p>
                <p className="tabular mt-1 font-display text-[22px] leading-none font-semibold">
                  {totals.dischargingThisWeek}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">planned discharges</p>
              </div>
              {(['South', 'North'] as const).map((r) => {
                const rFree = visible.filter((c) => c.region === r).reduce((n, c) => n + c.available, 0);
                const rCap  = visible.filter((c) => c.region === r).reduce((n, c) => n + c.capacity, 0);
                return rCap > 0 ? (
                  <div key={r}>
                    <p className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{r}</p>
                    <p className="tabular mt-1 font-display text-[22px] leading-none font-semibold">{rFree}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">of {rCap} free</p>
                  </div>
                ) : null;
              })}
            </div>
          </div>

          {/* Numbered 5 + 5 two-column grid */}
          {capacitySorted.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-line)]">
              <div className="grid sm:grid-cols-2">
                <div className="flex flex-col divide-y divide-[var(--color-line)]">
                  {capacityLeft.map((c, i) => (
                    <div
                      key={c.slug}
                      className="relative grid grid-cols-[1.5rem_minmax(0,1fr)_auto_3rem] items-center gap-2 overflow-hidden px-3 py-2.5"
                    >
                      <div
                        className={`absolute inset-y-0 left-0 w-1 ${c.region === 'South' ? 'bg-gradient-to-b from-sky-400 to-sky-200' : 'bg-gradient-to-b from-violet-500 to-violet-300'}`}
                        aria-hidden
                      />
                      <span className="tabular text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium">{c.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{c.region}</span>
                      </span>
                      <span className="tabular whitespace-nowrap text-[12px] text-muted-foreground">{c.available}/{c.capacity}</span>
                      <span className="tabular text-right text-[12px] font-semibold text-muted-foreground">{c.occupancyPercent}%</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col divide-y divide-[var(--color-line)] border-t border-[var(--color-line)] sm:border-t-0 sm:border-l">
                  {capacityRight.map((c, i) => (
                    <div
                      key={c.slug}
                      className="relative grid grid-cols-[1.5rem_minmax(0,1fr)_auto_3rem] items-center gap-2 overflow-hidden px-3 py-2.5"
                    >
                      <div
                        className={`absolute inset-y-0 left-0 w-1 ${c.region === 'South' ? 'bg-gradient-to-b from-sky-400 to-sky-200' : 'bg-gradient-to-b from-violet-500 to-violet-300'}`}
                        aria-hidden
                      />
                      <span className="tabular text-[11px] font-semibold text-muted-foreground">{capacityHalf + i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium">{c.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{c.region}</span>
                      </span>
                      <span className="tabular whitespace-nowrap text-[12px] text-muted-foreground">{c.available}/{c.capacity}</span>
                      <span className="tabular text-right text-[12px] font-semibold text-muted-foreground">{c.occupancyPercent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[12px] text-muted-foreground">Nothing in scope.</p>
          )}
        </Panel>
      </div>

      {/* ── Region comparison — a compact table, not clickable cards. The two regions are there for
             reference; a stakeholder who wants to drill in uses the scope toggle at the top. ── */}
      {picked.length === 0 && regionRollup.length > 1 ? (
        <div className="mt-4">
          <Panel title="By region">
            <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
              <div className="hidden grid-cols-[minmax(0,1fr)_repeat(5,minmax(0,0.8fr))_auto] gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-[10px] font-semibold tracking-[0.07em] text-muted-foreground uppercase sm:grid">
                <span>Region</span>
                <span className="text-right">Centres</span>
                <span className="text-right">Occupied</span>
                <span className="text-right">Overdue</span>
                <span className="text-right">On time</span>
                <span className="text-right">Discharges</span>
                <span className="w-4" />
              </div>
              {regionRollup.map(({ region: r, totals: t, count, assessed: ra }) => {
                const acting = ra.filter((a) => a.health === 'act').length;
                const watching = ra.filter((a) => a.health === 'watch').length;
                const isScoped = region === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRegion(isScoped ? 'all' : r)}
                    aria-pressed={isScoped}
                    className={`grid w-full grid-cols-1 gap-2 px-4 py-3.5 text-left transition hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_repeat(5,minmax(0,0.8fr))_auto] sm:items-center ${
                      isScoped ? 'bg-primary-soft' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="min-w-0">
                        <span className="block font-display text-[14px] font-semibold">{r}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {acting > 0 ? (
                            <span className="font-semibold text-overdue">{acting} to action</span>
                          ) : watching > 0 ? (
                            <span className="font-semibold text-attention">{watching} to watch</span>
                          ) : (
                            <span className="text-ontrack">All clear</span>
                          )}
                        </span>
                      </span>
                    </span>
                    <span className="tabular text-[13px] sm:text-right">
                      <span className="sm:hidden text-muted-foreground text-[11px]">Centres </span>
                      {count}
                    </span>
                    <span className="tabular text-[13px] sm:text-right">
                      <span className="sm:hidden text-muted-foreground text-[11px]">Occupied </span>
                      {t.occupied}/{t.capacity}
                      <span className="ml-1 text-[11px] text-muted-foreground">{t.occupancyPercent}%</span>
                    </span>
                    <span className={`tabular text-[13px] sm:text-right font-semibold ${t.overdue >= OVERDUE_ACT ? 'text-overdue' : t.overdue > 0 ? 'text-attention' : 'text-muted-foreground'}`}>
                      <span className="sm:hidden text-muted-foreground text-[11px] font-normal">Overdue </span>
                      {t.overdue}
                    </span>
                    <span className={`tabular text-[13px] sm:text-right ${t.onTimePercent < ONTIME_ACT ? 'font-bold text-overdue' : 'text-muted-foreground'}`}>
                      <span className="sm:hidden text-muted-foreground text-[11px] font-normal">On time </span>
                      {t.onTimePercent}%
                    </span>
                    <span className="tabular text-[13px] text-muted-foreground sm:text-right">
                      <span className="sm:hidden text-muted-foreground text-[11px]">Discharges </span>
                      {t.dischargingThisWeek}
                    </span>
                    <Activity
                      className={`hidden size-4 sm:block ${isScoped ? 'text-primary' : 'text-muted-foreground'}`}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
      ) : null}

      {/* ── The whole estate, one row per centre. Last because a stakeholder who needed only the
             verdict has already had it; this is for the one who wants to see every centre. ── */}
      <div className="mt-4">
        <Panel
          title="Every centre in scope"
          titleExtra={
            <div className="flex rounded-lg border border-[var(--color-line)] p-0.5">
              {(
                [
                  ['risk', 'Risk'],
                  ['occupancy', 'Occupancy'],
                  ['name', 'Name'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                    sort === key ? 'bg-[var(--color-accent)] text-white' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {sorted.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-line)] px-4 py-6 text-center">
              <p className="text-[12.5px] text-muted-foreground">
                No centre matches the current selection.
              </p>
              <button
                type="button"
                onClick={() => setRegion('all')}
                className="mt-2 text-[12.5px] font-semibold text-primary underline-offset-2 hover:underline"
              >
                Show the whole group
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
              <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))_auto] gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-2 text-[10px] font-semibold tracking-[0.07em] text-muted-foreground uppercase md:grid">
                <span>Centre</span>
                <span>Occupancy</span>
                <span className="text-right">Overdue</span>
                <span className="text-right">On time</span>
                <span className="text-right">Discharges</span>
                <span className="w-4" />
              </div>
              <div className="flex flex-col divide-y divide-[var(--color-line)]">
                {sorted.map(({ centre: c, health }) => {
                  const s = HEALTH_STYLE[health];
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => onOpenCentre(c.slug)}
                      className="group grid grid-cols-1 gap-x-3 gap-y-2 px-3.5 py-3 text-left transition hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))_auto] md:items-center"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`size-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{c.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {c.county} · {c.region}
                            {c.isConfigured ? '' : ' · no data'}
                          </span>
                        </span>
                      </span>

                      <span className="flex items-center gap-2.5">
                        <MiniBar percent={c.occupancyPercent} />
                        <span className="tabular w-16 shrink-0 text-right text-[11.5px] font-semibold text-muted-foreground">
                          {c.occupied}/{c.capacity}
                        </span>
                      </span>

                      <span
                        className={`tabular text-[12px] md:text-right ${
                          c.overdue >= OVERDUE_ACT
                            ? 'font-bold text-overdue'
                            : c.overdue > 0
                              ? 'font-semibold text-attention'
                              : 'text-muted-foreground'
                        }`}
                      >
                        <span className="md:hidden">Overdue </span>
                        {c.overdue}
                      </span>

                      <span
                        className={`tabular text-[12px] md:text-right ${
                          c.onTimePercent < ONTIME_ACT ? 'font-bold text-overdue' : 'text-muted-foreground'
                        }`}
                      >
                        <span className="md:hidden">On time </span>
                        {c.onTimePercent}%
                      </span>

                      <span className="tabular text-[12px] text-muted-foreground md:text-right">
                        <span className="md:hidden">Discharges </span>
                        {c.dischargingThisWeek}
                      </span>

                      <ArrowUpRight
                        className="hidden size-4 text-muted-foreground transition group-hover:text-primary md:block"
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── How the verdict was reached, and what is not real. Both belong at the bottom of a
             stakeholder page: nobody should have to ask either question in the room. ── */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-line)] bg-card p-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            How &ldquo;needs attention&rdquo; is decided
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <strong className="font-semibold text-foreground">Action</strong> — anyone still resident past
            a planned discharge date, {OVERDUE_ACT} or more overdue actions, or on-time completion below{' '}
            {ONTIME_ACT}%. <strong className="font-semibold text-foreground">Watch</strong> — any overdue
            action at all, or more than {PHOTO_WATCH} client photos missing.{' '}
            <strong className="font-semibold text-foreground">Clear</strong> — none of the above. No
            individual clinical detail appears at this level; restricted alerts and other risk figures
            show as group totals only — nothing here identifies which client.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-amber-900 uppercase dark:text-amber-300">
            What is real on this page
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-200">
            Centre names, counties and Primrose Lodge&rsquo;s current-day figures are real — the latter
            from the same admissions and required actions that drive its room board. Every other
            centre&rsquo;s occupancy, overdue count and on-time rate is{' '}
            <strong className="font-semibold">fictional</strong>, {totals.capacityUnconfirmed} of the{' '}
            {visible.length || centres.length} bed capacities above are placeholders, and the region
            grouping is a placeholder. The highest/lowest-occupied figures above are a{' '}
            <strong className="font-semibold">placeholder 3-month average for every centre, Primrose
            Lodge included</strong> — no centre&rsquo;s occupancy history is tracked yet, so there is
            nothing real to average until that exists.
          </p>
        </div>
      </div>
    </div>
  );
}
