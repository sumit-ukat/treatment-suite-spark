import { useMemo, useState } from 'react';
import { buildCentres, groupTotals, REGIONS, type CentreSummary } from './centres-data.js';
import { Chip, FilterPill, StatTile } from '../../components/ui.tsx';

type SortKey = 'name' | 'occupancy' | 'overdue' | 'onTime';

/** A compact occupancy bar. Colour is supporting information; the numbers are always present. */
function OccupancyBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
        <div
          className="h-full rounded-full bg-[var(--color-accent)]"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <span className="nums w-8 text-[11px] text-[var(--color-ink-muted)]">{percent}%</span>
    </div>
  );
}

function CentreRow({ centre, onOpen }: { centre: CentreSummary; onOpen: () => void }) {
  const attention = centre.overdue + centre.pastPlannedDischarge * 3;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-left transition hover:border-[var(--color-line)] hover:bg-[var(--color-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
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
        <div className="truncate text-[11px] text-[var(--color-ink-muted)]">
          {centre.county}
          {!centre.capacityConfirmed ? (
            <span title="Bed capacity not yet confirmed for this centre"> · capacity unconfirmed</span>
          ) : null}
        </div>
      </div>

      {/* Occupancy */}
      <div>
        <div className="nums text-[12.5px] font-medium">
          {centre.occupied}
          <span className="text-[var(--color-ink-muted)]">/{centre.capacity}</span>
        </div>
        <OccupancyBar percent={centre.occupancyPercent} />
      </div>

      {/* Available */}
      <div className="nums text-[13px] font-medium">
        {centre.available}
        <span className="ml-1 text-[10.5px] font-normal text-[var(--color-ink-muted)]">free</span>
      </div>

      {/* Overdue */}
      <div>
        {centre.overdue > 0 ? (
          <span className="nums text-[13px] font-semibold text-red-600 dark:text-red-400">
            {centre.overdue}
          </span>
        ) : (
          <span className="nums text-[13px] text-[var(--color-ink-muted)]">0</span>
        )}
        {centre.dueToday > 0 ? (
          <span className="nums ml-1.5 text-[10.5px] text-amber-600 dark:text-amber-400">
            +{centre.dueToday} today
          </span>
        ) : null}
      </div>

      {/* On time */}
      <div className="nums text-[13px] font-medium">
        {centre.onTimePercent}%
        <span className="ml-1 text-[10.5px] font-normal text-[var(--color-ink-muted)]">on time</span>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap justify-end gap-1">
        {centre.pastPlannedDischarge > 0 ? (
          <Chip icon="&#9650;" label="Past discharge" tone="alert" />
        ) : null}
        {centre.photoAttention > 0 ? (
          <Chip icon="!" label={`${centre.photoAttention} photo`} tone="warn" />
        ) : null}
        {centre.restrictedAlerts > 0 ? (
          <Chip icon="&#9873;" label={`${centre.restrictedAlerts}`} />
        ) : null}
        {attention === 0 && centre.photoAttention === 0 ? (
          <Chip icon="&#10003;" label="Clear" tone="good" />
        ) : null}
      </div>
    </button>
  );
}

export function GroupDashboard({ onOpenCentre }: { onOpenCentre: (slug: string) => void }) {
  const centres = useMemo(() => buildCentres(), []);
  const totals = useMemo(() => groupTotals(centres), [centres]);
  const [region, setRegion] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('name');

  const visible = centres.filter((c) => region === 'all' || c.region === region);

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

  const grouped = REGIONS.map((r) => ({
    region: r,
    centres: sorted.filter((c) => c.region === r),
  })).filter((g) => g.centres.length > 0);

  const needsAttention = centres.filter((c) => c.overdue > 0 || c.pastPlannedDischarge > 0).length;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5">
      <section
        aria-label="Group summary"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7"
      >
        <StatTile
          label="Centres"
          value={totals.centres}
          hint={`${REGIONS.length} regions`}
        />
        <StatTile
          label="Occupancy"
          value={`${totals.occupied}/${totals.capacity}`}
          hint={`${totals.occupancyPercent}% · ${totals.available} free`}
        />
        <StatTile
          label="Overdue"
          value={totals.overdue}
          hint="actions, all centres"
          tone={totals.overdue > 0 ? 'alert' : 'neutral'}
        />
        <StatTile label="Due today" value={totals.dueToday} hint="actions" tone="warn" />
        <StatTile
          label="Past discharge"
          value={totals.pastPlannedDischarge}
          hint="still in a bed"
          tone={totals.pastPlannedDischarge > 0 ? 'alert' : 'neutral'}
        />
        <StatTile
          label="On time"
          value={`${totals.onTimePercent}%`}
          hint="actions by due date"
        />
        <StatTile
          label="Need attention"
          value={needsAttention}
          hint={`of ${totals.centres} centres`}
          tone={needsAttention > 0 ? 'warn' : 'neutral'}
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

        <label className="ml-auto flex items-center gap-2 text-[11.5px] text-[var(--color-ink-muted)]">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="name">Name</option>
            <option value="occupancy">Occupancy, highest</option>
            <option value="overdue">Overdue, most</option>
            <option value="onTime">On time, worst</option>
          </select>
        </label>
      </div>

      {/* Column headings, echoing the row grid. */}
      <div className="mt-4 grid grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] gap-2 border-b border-[var(--color-line)] px-3 pb-1.5 text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
        <div>Centre</div>
        <div>Occupancy</div>
        <div>Available</div>
        <div>Overdue</div>
        <div>Completion</div>
        <div className="text-right">Flags</div>
      </div>

      {grouped.map((group) => (
        <section key={group.region} className="mt-3" aria-label={`${group.region} region`}>
          <h3 className="px-3 pb-1 text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
            {group.region}
            <span className="nums ml-1.5 font-normal normal-case">
              ({group.centres.length})
            </span>
          </h3>
          <div className="flex flex-col">
            {group.centres.map((c) => (
              <CentreRow key={c.slug} centre={c} onOpen={() => onOpenCentre(c.slug)} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
        A regional manager sees only the centres assigned to them. This view shows all ten because the
        access model is not built yet — once it is, the same page renders a subset, and nothing beyond
        an assigned centre is reachable even by editing the URL. No clinical detail appears at this
        level: restricted alerts are counts only.
      </p>
    </div>
  );
}
