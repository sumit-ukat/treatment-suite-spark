import { useMemo, useState } from 'react';
import { buildBoard, summarise, NOW, type BoardBed } from './demo-data.js';
import { formatDateWithDay } from './format.js';
import { AvailableCard, OccupiedCard } from './components/BedCard.tsx';
import { DetailPanel } from './components/DetailPanel.tsx';
import { NAV_GROUPS, Sidebar } from './components/Sidebar.tsx';
import { Chip, FilterPill, StatTile } from './components/ui.tsx';

type FilterId =
  | 'all'
  | 'occupied'
  | 'available'
  | 'overdue'
  | 'due_today'
  | 'discharging'
  | 'photo'
  | 'alerts';

const matchesFilter = (bed: BoardBed, filter: FilterId): boolean => {
  const o = bed.occupant;
  switch (filter) {
    case 'all':
      return true;
    case 'occupied':
      return o !== null;
    case 'available':
      return o === null;
    case 'overdue':
      return (o?.overdueCount ?? 0) > 0;
    case 'due_today':
      return (o?.dueTodayCount ?? 0) > 0;
    case 'discharging':
      return o !== null && o.daysUntilDischarge <= 7;
    case 'photo':
      return o !== null && o.photoState !== 'verified';
    case 'alerts':
      return o?.hasRestrictedAlert === true;
  }
};

export default function App() {
  const board = useMemo(() => buildBoard(NOW), []);
  const summary = useMemo(() => summarise(board), [board]);

  const [section, setSection] = useState('board');
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [openBed, setOpenBed] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visible = board.filter((bed) => {
    if (!matchesFilter(bed, filter)) return false;
    if (!q) return true;
    const o = bed.occupant;
    return (
      bed.label.toLowerCase().includes(q) ||
      (o?.displayName.toLowerCase().includes(q) ?? false) ||
      (o?.reference.toLowerCase().includes(q) ?? false) ||
      (o?.therapist.toLowerCase().includes(q) ?? false) ||
      (o?.buddy.toLowerCase().includes(q) ?? false)
    );
  });

  const selected = board.find((b) => b.label === openBed) ?? null;
  const activeNav = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === section);
  const isBoard = section === 'board';

  const counts = useMemo(
    () => ({
      occupied: board.filter((b) => b.occupant).length,
      available: board.filter((b) => !b.occupant).length,
      overdue: board.filter((b) => (b.occupant?.overdueCount ?? 0) > 0).length,
      dueToday: board.filter((b) => (b.occupant?.dueTodayCount ?? 0) > 0).length,
      discharging: board.filter((b) => b.occupant && b.occupant.daysUntilDischarge <= 7).length,
      photo: board.filter((b) => b.occupant && b.occupant.photoState !== 'verified').length,
      alerts: board.filter((b) => b.occupant?.hasRestrictedAlert).length,
    }),
    [board],
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        active={section}
        onSelect={setSection}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-[var(--color-ink-muted)] uppercase">
              Example Care Group
              <span aria-hidden="true">›</span>
              South East
            </div>
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[15px] leading-tight font-semibold">Primrose Lodge</h1>
              <Chip label="Development" tone="warn" />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <label className="relative hidden sm:block">
              <span className="sr-only">Search beds, clients, staff</span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[12px] text-[var(--color-ink-muted)]"
              >
                ⌕
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bed, client, staff…"
                className="w-[220px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] py-1.5 pr-2.5 pl-7 text-[12.5px] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <div className="nums hidden text-right text-[11px] leading-tight text-[var(--color-ink-muted)] lg:block">
              <div className="font-medium text-[var(--color-ink)]">
                {formatDateWithDay(NOW)}, 09:30
              </div>
              <div>Europe/London</div>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {isBoard ? (
            <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5">
              <section
                aria-label="Centre summary"
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7"
              >
                <StatTile
                  label="Occupancy"
                  value={`${summary.bedsOccupied}/${summary.bedsTotal}`}
                  hint={`${summary.occupancyPercent}% · ${summary.bedsAvailable} free`}
                />
                <StatTile
                  label="Overdue"
                  value={summary.overdue}
                  hint="actions, all clients"
                  tone={summary.overdue > 0 ? 'alert' : 'neutral'}
                  active={filter === 'overdue'}
                  onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')}
                />
                <StatTile
                  label="Due today"
                  value={summary.dueToday}
                  hint="actions"
                  tone={summary.dueToday > 0 ? 'warn' : 'neutral'}
                  active={filter === 'due_today'}
                  onClick={() => setFilter(filter === 'due_today' ? 'all' : 'due_today')}
                />
                <StatTile
                  label="Discharging"
                  value={summary.dischargingWithin7Days}
                  hint="within 7 days"
                  active={filter === 'discharging'}
                  onClick={() => setFilter(filter === 'discharging' ? 'all' : 'discharging')}
                />
                <StatTile
                  label="Past discharge"
                  value={summary.pastPlannedDischarge}
                  hint="still in a bed"
                  tone={summary.pastPlannedDischarge > 0 ? 'alert' : 'neutral'}
                />
                <StatTile
                  label="Photo attention"
                  value={summary.photoAttention}
                  hint="missing / unverified"
                  tone={summary.photoAttention > 0 ? 'warn' : 'neutral'}
                  active={filter === 'photo'}
                  onClick={() => setFilter(filter === 'photo' ? 'all' : 'photo')}
                />
                <StatTile
                  label="Restricted"
                  value={summary.restrictedAlerts}
                  hint="detail withheld"
                  active={filter === 'alerts'}
                  onClick={() => setFilter(filter === 'alerts' ? 'all' : 'alerts')}
                />
              </section>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <FilterPill
                  label="All beds"
                  count={board.length}
                  active={filter === 'all'}
                  onClick={() => setFilter('all')}
                />
                <FilterPill
                  label="Occupied"
                  count={counts.occupied}
                  active={filter === 'occupied'}
                  onClick={() => setFilter('occupied')}
                />
                <FilterPill
                  label="Available"
                  count={counts.available}
                  active={filter === 'available'}
                  onClick={() => setFilter('available')}
                />
                <span className="mx-1 h-5 w-px bg-[var(--color-line)]" aria-hidden="true" />
                <FilterPill
                  label="Overdue"
                  count={counts.overdue}
                  active={filter === 'overdue'}
                  onClick={() => setFilter('overdue')}
                />
                <FilterPill
                  label="Due today"
                  count={counts.dueToday}
                  active={filter === 'due_today'}
                  onClick={() => setFilter('due_today')}
                />
                <FilterPill
                  label="Discharging"
                  count={counts.discharging}
                  active={filter === 'discharging'}
                  onClick={() => setFilter('discharging')}
                />

                <span className="nums ml-auto text-[11.5px] text-[var(--color-ink-muted)]">
                  {visible.length} of {board.length} bed spaces
                  <span className="ml-1.5 opacity-70">· 16 rooms, 6A/6B & 9A/9B shared</span>
                </span>
              </div>

              {visible.length === 0 ? (
                <div className="mt-10 rounded-xl border border-dashed border-[var(--color-line)] py-14 text-center">
                  <div className="text-[13px] font-medium">No bed spaces match</div>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('all');
                      setQuery('');
                    }}
                    className="mt-1.5 text-[12px] text-[var(--color-accent)] underline underline-offset-2"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <section
                  aria-label="Bed spaces"
                  className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                >
                  {visible.map((bed) =>
                    bed.occupant ? (
                      <OccupiedCard key={bed.label} bed={bed} onOpen={() => setOpenBed(bed.label)} />
                    ) : (
                      <AvailableCard key={bed.label} bed={bed} />
                    ),
                  )}
                </section>
              )}

              <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
                Room cards omit clinical detail by design. Substance, detox, medical and safeguarding
                content appear nowhere on this board at any permission level — a restricted alert
                shows as a flag only, with detail reachable through the client file by authorised
                roles.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-24 text-center">
              <div
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[18px] text-[var(--color-accent)]"
              >
                {activeNav?.icon ?? '◻'}
              </div>
              <h2 className="mt-3.5 text-[16px] font-semibold">{activeNav?.label}</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
                Not built yet. It appears in the navigation so the shape of the product is reviewable
                — but nothing here is faked, so there is no screen to show.
              </p>
              <button
                type="button"
                onClick={() => setSection('board')}
                className="mt-4 rounded-lg bg-[var(--color-ink)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-surface)]"
              >
                Back to room board
              </button>
            </div>
          )}
        </main>
      </div>

      {selected ? <DetailPanel bed={selected} onClose={() => setOpenBed(null)} /> : null}
    </div>
  );
}
