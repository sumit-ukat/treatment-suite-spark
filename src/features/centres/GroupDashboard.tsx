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

      <div className="mt-4">
        <Panel title="Centres">
          <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
            <p className="text-sm text-muted-foreground">Occupancy and status at a glance</p>
            <div className="flex shrink-0 items-center gap-2">
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-card px-2.5 text-[12.5px] font-medium transition hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    Sort by: {sort === 'occupancy' ? 'Occupancy' : sort === 'overdue' ? 'Risk' : 'Name'}
                    <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {([['occupancy', 'Occupancy'], ['overdue', 'Risk'], ['name', 'Name']] as const).map(([key, label]) => (
                    <DropdownMenuItem key={key} onSelect={() => setSort(key)}>
                      {label}
                      {sort === key ? <span className="ml-auto text-[var(--color-accent)]">✓</span> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-6">
            {([
              { label: 'North', regions: ['North'] },
              { label: 'South', regions: ['South'] },
            ] as const).map(({ label, regions }) => {
              const group = sorted.filter((c) => (regions as readonly string[]).includes(c.region));
              if (group.length === 0) return null;
              return (
                <div key={label}>
                  <h3 className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.07em] uppercase text-[var(--color-ink-muted)]">
                    {label}
                    <span className="font-normal">· {group.length} centre{group.length !== 1 ? 's' : ''}</span>
                  </h3>
                  <div className="flex flex-col divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)]">
                    {group.map((c) => (
                      <CentreRow key={c.slug} centre={c} onOpen={() => onOpenCentre(c.slug)} />
                    ))}
                  </div>
                </div>
              );
            })}
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
