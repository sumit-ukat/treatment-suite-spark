import { useState } from 'react';
import type { BoardBed } from './board-data.js';
import { formatDate } from '../../lib/format.js';
import { PhotoBadge } from './BedCard.tsx';
import { Chip } from '../../components/ui.tsx';

/**
 * Dense list view.
 *
 * The card grid is good for a glance and poor for a scan: each bed costs ~180px of height, so a
 * handover meeting spends its time scrolling. Here every bed is one 40px row and all eighteen fit on
 * a laptop screen at once, which is the actual job — comparing beds, not admiring one.
 *
 * Empty beds stay in the list rather than being filtered out. Where the gaps fall matters when you
 * are placing an admission, and a list that silently omits ten of eighteen rows is lying about the
 * shape of the centre.
 */

type SortKey = 'bed' | 'name' | 'day' | 'discharge' | 'progress' | 'attention';
type Dir = 'asc' | 'desc';

const attentionScore = (b: BoardBed): number => {
  const o = b.occupant;
  if (!o) return -1;
  return (
    o.overdueCount * 10 +
    (o.daysUntilDischarge < 0 ? 30 : 0) +
    o.notApplicableCount * 2 +
    (o.therapist === null ? 15 : 0)
  );
};

function SortHeader({
  label,
  col,
  sort,
  dir,
  onSort,
  className = '',
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  dir: Dir;
  onSort: (c: SortKey) => void;
  className?: string;
}) {
  const active = sort === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`flex items-center gap-1 text-left text-[10px] font-semibold tracking-[0.06em] uppercase transition ${
        active ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
      } ${className}`}
    >
      {label}
      <span aria-hidden="true" className={active ? 'opacity-100' : 'opacity-0'}>
        {dir === 'asc' ? '↑' : '↓'}
      </span>
    </button>
  );
}

const GRID =
  'grid grid-cols-[52px_minmax(150px,1.4fr)_86px_92px_minmax(96px,1fr)_minmax(96px,1fr)_120px_minmax(150px,1.2fr)] items-center gap-3';

export function BedList({
  beds,
  onOpen,
}: {
  beds: readonly BoardBed[];
  onOpen: (label: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>('bed');
  const [dir, setDir] = useState<Dir>('asc');

  const onSort = (c: SortKey) => {
    if (c === sort) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setSort(c);
      // Attention and progress are almost always wanted worst-first.
      setDir(c === 'attention' || c === 'progress' ? 'desc' : 'asc');
    }
  };

  const sorted = [...beds].sort((a, b) => {
    const m = dir === 'asc' ? 1 : -1;
    switch (sort) {
      case 'bed':
        return m * a.label.localeCompare(b.label, undefined, { numeric: true });
      case 'name':
        return m * (a.occupant?.displayName ?? '￿').localeCompare(b.occupant?.displayName ?? '￿');
      case 'day':
        return m * ((a.occupant?.treatmentDay ?? -1) - (b.occupant?.treatmentDay ?? -1));
      case 'discharge':
        return m * ((a.occupant?.daysUntilDischarge ?? 9999) - (b.occupant?.daysUntilDischarge ?? 9999));
      case 'progress': {
        const pct = (x: BoardBed) =>
          x.occupant ? x.occupant.completedCount / x.occupant.totalCount : -1;
        return m * (pct(a) - pct(b));
      }
      case 'attention':
        return m * (attentionScore(a) - attentionScore(b));
    }
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-line)] bg-card">
      <div className="min-w-[900px]">
        <div
          className={`${GRID} sticky top-0 z-10 border-b border-[var(--color-line)] bg-card px-3 py-2`}
        >
          <SortHeader label="Bed" col="bed" sort={sort} dir={dir} onSort={onSort} />
          <SortHeader label="Client" col="name" sort={sort} dir={dir} onSort={onSort} />
          <SortHeader label="Day" col="day" sort={sort} dir={dir} onSort={onSort} />
          <SortHeader label="Discharge" col="discharge" sort={sort} dir={dir} onSort={onSort} />
          <span className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
            Therapist
          </span>
          <span className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
            Buddy
          </span>
          <SortHeader label="Actions" col="progress" sort={sort} dir={dir} onSort={onSort} />
          <SortHeader label="Attention" col="attention" sort={sort} dir={dir} onSort={onSort} />
        </div>

        <ul className="divide-y divide-[var(--color-line)]">
          {sorted.map((bed) => {
            const o = bed.occupant;

            if (!o) {
              return (
                <li key={bed.label}>
                  <div className={`${GRID} px-3 py-1.5 opacity-60`}>
                    <span className="nums rounded-md bg-[color:color-mix(in_oklab,var(--brand-blue)_24%,transparent)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--brand-blue-ink)]">
                      {bed.label}
                    </span>
                    <span className="text-[12px] text-[var(--brand-blue-ink)]">
                      Available
                      <span className="ml-1.5 text-[10.5px] text-[var(--color-ink-muted)]">
                        {bed.shared ? 'shared room bed' : 'single room'}
                      </span>
                    </span>
                    <span className="col-span-6" />
                  </div>
                </li>
              );
            }

            const pct = Math.round((o.completedCount / o.totalCount) * 100);
            const overrun = o.daysUntilDischarge < 0;

            return (
              <li key={bed.label}>
                <button
                  type="button"
                  onClick={() => onOpen(bed.label)}
                  className={`${GRID} w-full px-3 py-2 text-left transition hover:bg-[var(--color-accent-soft)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]`}
                >
                  <span className="nums rounded-md bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--color-accent)]">
                    {bed.label}
                  </span>

                  <span className="flex min-w-0 items-center gap-2">
                    <PhotoBadge occupant={o} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium">{o.displayName}</span>
                      <span className="nums block truncate text-[10.5px] text-[var(--color-ink-muted)]">
                        {o.reference}
                      </span>
                    </span>
                  </span>

                  <span className="nums text-[12px]">
                    {overrun ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {o.treatmentDay}
                        <span className="font-normal"> / {o.durationDays}</span>
                      </span>
                    ) : (
                      <>
                        {o.treatmentDay}
                        <span className="text-[var(--color-ink-muted)]"> / {o.durationDays}</span>
                      </>
                    )}
                  </span>

                  <span
                    className={`nums text-[12px] ${
                      overrun
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : o.daysUntilDischarge <= 3
                          ? 'text-amber-600 dark:text-amber-400'
                          : ''
                    }`}
                  >
                    {formatDate(o.plannedDischargeDate)}
                  </span>

                  <span className="truncate text-[12px]">
                    {o.therapist ?? (
                      <span className="text-amber-600 dark:text-amber-400">Not assigned</span>
                    )}
                  </span>

                  <span className="truncate text-[12px]">{o.buddy}</span>

                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
                      <span
                        className="block h-full rounded-full bg-[var(--color-accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="nums text-[11px] text-[var(--color-ink-muted)]">
                      {o.completedCount}/{o.totalCount}
                    </span>
                  </span>

                  <span className="flex flex-wrap gap-1">
                    {overrun ? <Chip icon="&#9650;" label="Past discharge" tone="alert" /> : null}
                    {o.overdueCount > 0 ? (
                      <Chip icon="&#9650;" label={`${o.overdueCount}`} tone="alert" />
                    ) : null}
                    {o.dueTodayCount > 0 ? (
                      <Chip icon="&#9679;" label={`${o.dueTodayCount}`} tone="warn" />
                    ) : null}
                    {o.notApplicableCount > 0 ? (
                      <Chip
                        icon="&#8212;"
                        label={`${o.notApplicableCount}`}
                        title="Not applicable - the planned programme ends before these fall due."
                      />
                    ) : null}
                    {o.therapist === null ? (
                      <Chip icon="!" label="No therapist" tone="warn" />
                    ) : null}
                    {o.hasRestrictedAlert ? (
                      <Chip icon="&#9873;" label="" tone="alert" title="Restricted alert" />
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
