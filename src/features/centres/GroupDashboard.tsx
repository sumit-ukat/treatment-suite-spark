import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  Clock,
  BedDouble as OccupancyIcon,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { buildCentres, groupTotals, REGIONS, type CentreSummary } from './centres-data.js';
import { OccupancyBar } from '../../components/occupancy-bar.tsx';
import { MetricCard } from '../../components/metric-card.tsx';
import { StatusBadge } from '../../components/status-badge.tsx';
import { BarChart, Chip, FilterPill, Panel, RingChart } from '../../components/ui.tsx';

type SortKey = 'name' | 'occupancy' | 'overdue' | 'onTime';

function CentreRow({ centre, onOpen }: { centre: CentreSummary; onOpen: () => void }) {
  const attention = centre.overdue + centre.pastPlannedDischarge * 3;
  const isClear = attention === 0 && centre.photoAttention === 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-left transition hover:border-[var(--color-line)] hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      {/* Centre */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold">{centre.name}</span>
          {centre.isConfigured ? (
            <Chip label="Configured" tone="accent" />
          ) : (
            <Chip label="No data" />
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {centre.county}
          {!centre.capacityConfirmed ? (
            <span title="Bed capacity not yet confirmed for this centre"> · capacity unconfirmed</span>
          ) : null}
        </div>
      </div>

      {/* Occupancy */}
      <OccupancyBar value={centre.occupied} capacity={centre.capacity} />

      {/* Available */}
      <div className="nums text-[13px] font-medium">
        {centre.available}
        <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">free</span>
      </div>

      {/* Overdue */}
      <div>
        {centre.overdue > 0 ? (
          <span className="nums text-[13px] font-semibold text-overdue">{centre.overdue}</span>
        ) : (
          <span className="nums text-[13px] text-muted-foreground">0</span>
        )}
        {centre.dueToday > 0 ? (
          <span className="nums text-attention ml-1.5 text-[10.5px]">+{centre.dueToday} today</span>
        ) : null}
      </div>

      {/* On time */}
      <div className="nums text-[13px] font-medium">
        {centre.onTimePercent}%
        <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">on time</span>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap justify-end gap-1">
        {centre.pastPlannedDischarge > 0 ? (
          <StatusBadge status="overdue" label="Past discharge" size="sm" />
        ) : null}
        {centre.photoAttention > 0 ? (
          <StatusBadge status="attention" label={`${centre.photoAttention} photo`} size="sm" />
        ) : null}
        {centre.restrictedAlerts > 0 ? <Chip icon="&#9873;" label={`${centre.restrictedAlerts}`} /> : null}
        {isClear ? <StatusBadge status="ontrack" size="sm" /> : null}
      </div>
    </button>
  );
}

export function GroupDashboard({ onOpenCentre }: { onOpenCentre: (slug: string) => void }) {
  const centres = useMemo(() => buildCentres(), []);
  const totals = useMemo(() => groupTotals(centres), [centres]);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('name');

  const q = query.trim().toLowerCase();
  const visible = centres.filter((c) => {
    if (region !== 'all' && c.region !== region) return false;
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

  const needsAttention = centres.filter((c) => c.overdue > 0 || c.pastPlannedDischarge > 0).length;

  // Always all four regions, regardless of the region filter above — a comparison chart that shrank
  // to one bar whenever a region was selected would be a strange way to compare regions.
  const regionOccupancy = REGIONS.map((r) => {
    const inRegion = centres.filter((c) => c.region === r);
    const capacity = inRegion.reduce((n, c) => n + c.capacity, 0);
    const occupied = inRegion.reduce((n, c) => n + c.occupied, 0);
    return { label: r, value: capacity ? Math.round((occupied / capacity) * 100) : 0 };
  });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5">
      <section aria-label="Group summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="Centres" value={totals.centres} hint={`${REGIONS.length} regions`} icon={<Building2 className="size-4" />} />
        <MetricCard
          label="Occupancy"
          value={`${totals.occupied}/${totals.capacity}`}
          hint={`${totals.occupancyPercent}% · ${totals.available} free`}
          icon={<OccupancyIcon className="size-4" />}
          accent="primary"
        />
        <MetricCard
          label="Overdue"
          value={totals.overdue}
          hint="actions, all centres"
          icon={<AlertTriangle className="size-4" />}
          accent={totals.overdue > 0 ? 'pink' : 'default'}
        />
        <MetricCard label="Due today" value={totals.dueToday} hint="actions" icon={<Clock className="size-4" />} />
        <MetricCard
          label="Past discharge"
          value={totals.pastPlannedDischarge}
          hint="still in a bed"
          icon={<TriangleAlert className="size-4" />}
          accent={totals.pastPlannedDischarge > 0 ? 'pink' : 'default'}
        />
        <MetricCard
          label="On time"
          value={`${totals.onTimePercent}%`}
          hint="actions by due date"
          icon={<CalendarCheck className="size-4" />}
          accent="blue"
        />
        <MetricCard
          label="Need attention"
          value={needsAttention}
          hint={`of ${totals.centres} centres`}
          icon={<AlertTriangle className="size-4" />}
        />
      </section>

      {/* Data-provenance notice. The figures below are not real and the page says so plainly. */}
      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-200">
        <strong className="font-semibold">Illustrative figures.</strong> Centre names and counties are
        real. Occupancy, overdue counts and on-time rates are <strong>fictional</strong>. Bed capacity
        is confirmed for Primrose Lodge only — the other {totals.capacityUnconfirmed} are placeholders,
        so every occupancy percentage derived from them is provisional. The region grouping is a
        placeholder too. Only Primrose Lodge is actually configured in the database.
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterPill label="All regions" count={centres.length} active={region === 'all'} onClick={() => setRegion('all')} />
        {REGIONS.map((r) => (
          <FilterPill
            key={r}
            label={r}
            count={centres.filter((c) => c.region === r).length}
            active={region === r}
            onClick={() => setRegion(r)}
          />
        ))}
      </div>

      {/* 1:1.6 column ratio matches the source's own two-panel section exactly. */}
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-4">
          <Panel title="At a glance" subtitle="Group totals, all centres">
            <div className="flex items-center justify-around gap-3 py-1">
              <RingChart percent={totals.occupancyPercent} value={`${totals.occupancyPercent}%`} label="Occupancy" />
              <RingChart percent={totals.onTimePercent} value={`${totals.onTimePercent}%`} label="On time" tone="good" />
            </div>
          </Panel>
          <Panel title="Occupancy by region" subtitle="Each bar is labelled with its exact figure.">
            <BarChart data={regionOccupancy} />
          </Panel>
        </div>

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

          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No centres match &ldquo;{query}&rdquo;.</p>
          ) : (
            <>
              {/* Column headings, echoing the row grid. */}
              <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] gap-2 border-b border-[var(--color-line)] px-3 pb-1.5 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                <div>Centre</div>
                <div>Occupancy</div>
                <div>Available</div>
                <div>Overdue</div>
                <div>Completion</div>
                <div className="text-right">Flags</div>
              </div>
              <div className="flex flex-col divide-y divide-[var(--color-line)]">
                {sorted.map((c) => (
                  <CentreRow key={c.slug} centre={c} onOpen={() => onOpenCentre(c.slug)} />
                ))}
              </div>
            </>
          )}
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
