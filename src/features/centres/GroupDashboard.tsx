import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BedDouble,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { buildCentres, groupTotals, type CentreSummary } from './centres-data.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { daysLeftInWeek } from '../../domain/zoned-time.js';
import { formatDate } from '../../lib/format.js';
import { OccupancyBar } from '../../components/occupancy-bar.tsx';
import { MetricCard } from '../../components/metric-card.tsx';
import { StatusBadge, type StatusKey } from '../../components/status-badge.tsx';
import { Chip, Panel } from '../../components/ui.tsx';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.tsx';

// TODO: same scoped simplification as elsewhere — every configured centre today is Europe/London.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

type SortKey = 'name' | 'occupancy' | 'overdue' | 'onTime';

function CentreRow({ centre, onOpen }: { centre: CentreSummary; onOpen: () => void }) {
  const status: StatusKey =
    centre.overdue > 4 ? 'overdue' : centre.overdue > 0 || centre.pastPlannedDischarge > 0 ? 'attention' : 'ontrack';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-1 gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition hover:border-[var(--color-line)] hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{centre.name}</span>
          <StatusBadge status={status} size="sm" />
          {centre.isConfigured ? null : <Chip label="No data" />}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {centre.county} &middot; {centre.region}
        </p>
      </div>

      <OccupancyBar value={centre.occupied} capacity={centre.capacity} />

      <div className="tabular flex items-center gap-3.5 text-xs sm:justify-end">
        <span className={centre.overdue > 0 ? 'font-semibold text-overdue' : 'text-muted-foreground'}>
          {centre.overdue} overdue
        </span>
        <span className={centre.dueToday > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>
          {centre.dueToday} today
        </span>
        {/* Only when there is one — a "0 past discharge" on every row would drown the rows that
            actually have one, which is the whole reason to show it. */}
        {centre.pastPlannedDischarge > 0 ? (
          <span className="font-semibold text-overdue">
            {centre.pastPlannedDischarge} past discharge
          </span>
        ) : null}
        <span className="text-muted-foreground">{centre.onTimePercent}% on time</span>
        <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden />
      </div>
    </button>
  );
}

export function GroupDashboard({ onOpenCentre }: { onOpenCentre: (slug: string) => void }) {
  const centres = useMemo(() => buildCentres(), []);
  /** Chosen centre slugs. Empty means every centre — "none selected" and "all selected" would
   * otherwise be the same view reached two ways, and the empty set is the one that survives a centre
   * being added later. Scopes the headline figures and the region breakdown as well as the list,
   * since those numbers are the reason to narrow the view at all. */
  const [scope, setScope] = useState<readonly string[]>([]);
  const [sort, setSort] = useState<SortKey>('name');

  const visible = scope.length === 0 ? centres : centres.filter((c) => scope.includes(c.slug));
  /** The one selected centre, when exactly one is selected — the only case where a caveat or a label
   * can name a specific centre truthfully. */
  const only = visible.length === 1 && scope.length === 1 ? visible[0]! : null;
  // groupTotals already sums whatever it is handed, so a subset needs no separate code path.
  const totals = useMemo(() => groupTotals(visible), [visible]);

  const toggle = (slug: string) =>
    setScope((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

  // Whether anything in scope has real data behind it, which decides which caveat is honest.
  const anyConfigured = visible.some((c) => c.isConfigured);

  // Names the window rather than leaving "this week" to interpretation — on a Friday the difference
  // between "the rest of this week" and "the next seven days" is most of a working week.
  const weekHint = useMemo(() => {
    const now = new Date();
    const left = daysLeftInWeek(now, TZ);
    if (left === 0) return 'Today — last day of the week';
    const sunday = new Date(now);
    sunday.setDate(sunday.getDate() + left);
    return `Today to Sun ${formatDate(sunday)}`;
  }, []);

  const scopeLabel =
    scope.length === 0
      ? 'All centres'
      : only
        ? only.name
        : `${scope.length} centres`;

  const sorted = [...visible].sort((a, b) => {
    switch (sort) {
      case 'occupancy':
        return b.occupancyPercent - a.occupancyPercent;
      case 'overdue':
        return b.overdue - a.overdue;
      case 'onTime':
        return a.onTimePercent - b.onTimePercent;
      case 'name':
        return a.name.localeCompare(b.name);
    }
  });

  /**
   * The triage list: which centres need a look, worst first, and why.
   *
   * The ordering weight is a judgement, so the *reasons* carry the real counts and the score is
   * never shown — a manager acts on "3 past their discharge date", not on "risk 94". A client past
   * their planned discharge outranks everything else because it is both a compliance breach and a
   * bed that cannot be offered; a full centre is listed because it cannot take an admission at all,
   * which is operationally urgent even though nothing is wrong.
   */
  const attention = useMemo(() => {
    return visible
      .map((c) => {
        const reasons: string[] = [];
        if (c.pastPlannedDischarge > 0) {
          reasons.push(
            `${c.pastPlannedDischarge} past planned discharge${c.pastPlannedDischarge === 1 ? '' : 's'}`,
          );
        }
        if (c.overdue > 0) reasons.push(`${c.overdue} overdue action${c.overdue === 1 ? '' : 's'}`);
        if (c.available === 0) reasons.push('No free beds');
        if (c.photoAttention > 0) reasons.push(`${c.photoAttention} without a photograph`);
        if (c.onTimePercent < 80) reasons.push(`${c.onTimePercent}% on time`);

        const score =
          c.pastPlannedDischarge * 40 +
          c.overdue * 5 +
          (c.available === 0 ? 15 : 0) +
          c.photoAttention * 2 +
          Math.max(0, 80 - c.onTimePercent);

        return { centre: c, reasons, score };
      })
      .filter((r) => r.reasons.length > 0)
      .sort((a, b) => b.score - a.score);
  }, [visible]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5">
      {/* Ordered by how soon it needs a decision: what is late, then what is due now, then what is
          coming, then the standing context. A manager reading left to right meets the exceptions
          first rather than having to hunt past the headline percentages for them. */}
      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Overdue actions"
          value={totals.overdue}
          hint="Past their due date"
          accent="pink"
          icon={<CircleAlert className="size-4" />}
        />
        <MetricCard
          label="Due today"
          value={totals.dueToday}
          hint="Actions to complete today"
          accent="primary"
          icon={<CalendarClock className="size-4" />}
        />
        <MetricCard
          label="Past discharge"
          value={totals.pastPlannedDischarge}
          hint="Still resident past the planned date"
          accent="pink"
          icon={<TriangleAlert className="size-4" />}
        />
        <MetricCard
          label="Discharges this week"
          value={totals.dischargingThisWeek}
          hint={weekHint}
          icon={<CalendarCheck className="size-4" />}
        />
        <MetricCard
          label={scope.length === 0 ? 'Group occupancy' : 'Occupancy'}
          value={totals.occupancyPercent}
          suffix="%"
          hint={`${totals.occupied} of ${totals.capacity} beds · ${totals.available} free`}
          accent="primary"
          icon={<BedDouble className="size-4" />}
        />
        <MetricCard
          label="On-time completion"
          value={totals.onTimePercent}
          suffix="%"
          hint="Actions completed against plan"
          accent="blue"
          icon={<TrendingUp className="size-4" />}
        />
      </section>

      {/* Data-provenance notice, scoped along with everything else. Narrowing to one centre makes the
          aggregate caveat wrong in both directions — it overstates the fiction for Primrose Lodge,
          whose figures are real, and understates it for the other nine, whose every number is
          invented. The source has no equivalent notice; its figures are demo data throughout. */}
      {only?.isConfigured ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-emerald-900 dark:text-emerald-200">
          <strong className="font-semibold">Real figures.</strong> {only.name} is the one centre
          configured in the database, so these numbers come from its actual admissions and required
          actions — the same source as its room board. Client and staff names are pseudonyms.
        </div>
      ) : only ? (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-200">
          <strong className="font-semibold">Illustrative figures.</strong> {only.name}&rsquo;s name and
          county are real. Everything else here — occupancy, overdue counts, on-time rate and its{' '}
          {only.capacity}-bed capacity — is <strong>fictional</strong>. This centre is not configured
          in the database, so there is nothing real to report yet.
        </div>
      ) : anyConfigured ? (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-200">
          <strong className="font-semibold">Mixed figures.</strong> Centre names and counties are real,
          and Primrose Lodge&rsquo;s numbers come from the database. Every other centre&rsquo;s
          occupancy, overdue count and on-time rate is <strong>fictional</strong>, and{' '}
          {totals.capacityUnconfirmed} of the {visible.length} bed capacities totalled above are
          placeholders — so the combined percentages are provisional. The region grouping is a
          placeholder too.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-200">
          <strong className="font-semibold">Illustrative figures.</strong> These centres&rsquo; names
          and counties are real. Everything else above is <strong>fictional</strong>: none of them is
          configured in the database, and none of their bed capacities is confirmed.
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-6">
          <Panel
            title="Attention required"
            subtitle={
              attention.length === 0
                ? 'Nothing outstanding across the centres in view.'
                : `${attention.length} of ${visible.length} centres need a look`
            }
          >
            {attention.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No overdue actions, no clients past their discharge date, no missing photographs.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--color-line)]">
                {attention.map(({ centre, reasons }) => (
                  <li key={centre.slug}>
                    <button
                      type="button"
                      onClick={() => onOpenCentre(centre.slug)}
                      className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{centre.name}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {reasons.join(' · ')}
                        </span>
                      </div>
                      <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Capacity outlook"
            subtitle="Beds free now, and what the planned discharges would add."
          >
            <dl className="flex flex-col gap-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted-foreground">Free now</dt>
                <dd className="tabular text-lg font-semibold">{totals.available}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted-foreground">Discharging by Sunday</dt>
                <dd className="tabular text-lg font-semibold">+{totals.dischargingThisWeek}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-3">
                <dt className="text-sm font-medium">Free by Sunday</dt>
                <dd className="tabular text-lg font-semibold text-[var(--color-accent)]">
                  {totals.available + totals.dischargingThisWeek}
                </dd>
              </div>
            </dl>
            {/* Said plainly rather than presented as a forecast: this is addition, not a model. It
                assumes every planned discharge happens on time and nobody is admitted meanwhile —
                neither of which this system can currently predict. */}
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Arithmetic, not a forecast: assumes every planned discharge goes ahead and no new
              admissions arrive. {totals.pastPlannedDischarge > 0 ? (
                <>
                  {totals.pastPlannedDischarge} client
                  {totals.pastPlannedDischarge === 1 ? ' is' : 's are'} already past a planned
                  discharge date, so treat it as optimistic.
                </>
              ) : null}
            </p>
          </Panel>
        </div>

        <Panel title="Centres">
          <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
            <p className="text-sm text-muted-foreground">Occupancy and status at a glance</p>
            <div className="flex shrink-0 items-center gap-2">
              {/* Filters the figures above as well as this list, so it sits with the list it visibly
                  changes rather than off on its own. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-card px-2.5 text-[12.5px] font-medium transition hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    {scopeLabel}
                    <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-auto">
                  <DropdownMenuLabel>Show centres</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {[...centres]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <DropdownMenuCheckboxItem
                        key={c.slug}
                        checked={scope.includes(c.slug)}
                        // Radix closes the menu on select by default; picking several centres in one
                        // go is the whole point of a multi-select.
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => toggle(c.slug)}
                      >
                        {c.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  {scope.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setScope([])}>
                        Show all centres
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex rounded-lg border border-[var(--color-line)] p-0.5">
                {(
                  [
                    ['occupancy', 'Occupancy'],
                    ['overdue', 'Risk'],
                    ['name', 'Name'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      sort === key ? 'bg-[var(--color-accent)] text-white' : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-col divide-y divide-[var(--color-line)]">
            {sorted.map((c) => (
              <CentreRow key={c.slug} centre={c} onOpen={() => onOpenCentre(c.slug)} />
            ))}
          </div>
        </Panel>
      </div>

      <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
        A regional manager sees only the centres assigned to them. This view shows all ten because the
        access model is not built yet — once it is, the same page renders a subset, and nothing beyond
        an assigned centre is reachable even by editing the URL. No clinical detail appears at this
        level: restricted alerts are counts only.
      </p>
    </div>
  );
}
