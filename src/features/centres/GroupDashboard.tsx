import { useMemo, useState } from 'react';
import { ArrowUpRight, BedDouble, CalendarCheck, CircleAlert, Search, TrendingUp } from 'lucide-react';
import { buildCentres, groupTotals, REGIONS, type CentreSummary } from './centres-data.js';
import { OccupancyBar } from '../../components/occupancy-bar.tsx';
import { MetricCard } from '../../components/metric-card.tsx';
import { StatusBadge, type StatusKey } from '../../components/status-badge.tsx';
import { Chip, Panel } from '../../components/ui.tsx';

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

      <div className="tabular flex items-center gap-4 text-xs sm:justify-end">
        <span className={centre.overdue > 0 ? 'font-semibold text-overdue' : 'text-muted-foreground'}>
          {centre.overdue} overdue
        </span>
        <span className="text-muted-foreground">{centre.onTimePercent}% on time</span>
        <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden />
      </div>
    </button>
  );
}

export function GroupDashboard({ onOpenCentre }: { onOpenCentre: (slug: string) => void }) {
  const centres = useMemo(() => buildCentres(), []);
  const totals = useMemo(() => groupTotals(centres), [centres]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

  const q = query.trim().toLowerCase();
  const visible = centres.filter((c) => {
    if (q && !`${c.name} ${c.county}`.toLowerCase().includes(q)) return false;
    return true;
  });

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

  const regions = REGIONS.map((r) => {
    const inRegion = centres.filter((c) => c.region === r);
    const capacity = inRegion.reduce((n, c) => n + c.capacity, 0);
    const occupied = inRegion.reduce((n, c) => n + c.occupied, 0);
    return { region: r, occupied, capacity, pct: capacity ? Math.round((occupied / capacity) * 100) : 0 };
  });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5">
      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          label="Group occupancy"
          value={totals.occupancyPercent}
          suffix="%"
          hint={`${totals.occupied} of ${totals.capacity} beds occupied`}
          accent="primary"
          icon={<BedDouble className="size-4" />}
        />
        <MetricCard
          label="Overdue actions"
          value={totals.overdue}
          hint="Required care actions past their due date"
          accent="pink"
          icon={<CircleAlert className="size-4" />}
        />
        <MetricCard
          label="On-time completion"
          value={totals.onTimePercent}
          suffix="%"
          hint="Actions completed against plan"
          accent="blue"
          icon={<TrendingUp className="size-4" />}
        />
        <MetricCard
          label="Discharges due"
          value={totals.dischargingWithin7Days}
          hint="Planned within the next 7 days"
          icon={<CalendarCheck className="size-4" />}
        />
      </section>

      {/* Data-provenance notice. The figures above are not real and the page says so plainly — the
          source has no equivalent notice since its figures are demo data with no honesty obligation. */}
      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-200">
        <strong className="font-semibold">Illustrative figures.</strong> Centre names and counties are
        real. Occupancy, overdue counts and on-time rates are <strong>fictional</strong>. Bed capacity
        is confirmed for Primrose Lodge only — the other {totals.capacityUnconfirmed} are placeholders,
        so every occupancy percentage derived from them is provisional. The region grouping is a
        placeholder too. Only Primrose Lodge is actually configured in the database.
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Panel title="Occupancy by region" subtitle="Each bar is labelled with its exact figure.">
          <ul className="flex flex-col gap-5">
            {regions.map((r) => (
              <li key={r.region}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{r.region}</span>
                  <span className="tabular text-sm font-semibold text-muted-foreground">{r.pct}%</span>
                </div>
                <OccupancyBar value={r.occupied} capacity={r.capacity} showLabel={false} className="mt-2" />
                <p className="tabular mt-1 text-xs text-muted-foreground">
                  {r.occupied} of {r.capacity} beds
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Centres">
          <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
            <p className="text-sm text-muted-foreground">Occupancy and status at a glance</p>
            <div className="flex shrink-0 items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a centre"
                  aria-label="Find a centre"
                  className="h-9 w-36 rounded-lg border border-[var(--color-line)] bg-card pl-8 pr-3 text-[12.5px] transition placeholder:text-muted-foreground focus:border-[var(--color-accent)] focus:outline-none sm:w-48"
                />
              </div>
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
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No centres match &ldquo;{query}&rdquo;.</p>
          ) : null}
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
