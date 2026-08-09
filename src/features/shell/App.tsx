import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BedDouble,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Clock,
  Flag,
  ImageOff,
  LayoutGrid,
  List as ListIcon,
  LogOut,
  Minus,
  Plus,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { summarise, type BoardBed, type BoardSummary } from '../rooms/board-data.js';
import { buildRealBoard } from '../rooms/real-board-data.js';
import { buildCentres, type CentreSummary } from '../centres/centres-data.js';
import { formatDateWithDay } from '../../lib/format.js';
import { BrandMark } from '../../components/brand.tsx';
import { MetricCard } from '../../components/metric-card.tsx';
import { ThemeToggle } from '../../components/theme-toggle.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.tsx';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  AccessErrorScreen,
  LoadingScreen,
  LoginScreen,
  NoAccessScreen,
} from '../auth/LoginScreen.tsx';
import { AvailableCard, OccupiedCard } from '../rooms/BedCard.tsx';
import { BedList } from '../rooms/BedList.tsx';
import { DetailPanel } from '../rooms/DetailPanel.tsx';
import { GroupDashboard } from '../centres/GroupDashboard.tsx';
import { Administration } from '../administration/Administration.tsx';
import { AdmitClientForm } from '../admissions/AdmitClientForm.tsx';
import { ClientDirectory } from '../clients/ClientDirectory.tsx';
import { AuditHistory } from '../administration/AuditHistory.tsx';
import { NAV_GROUPS, Sidebar } from './Sidebar.tsx';
import { Chip, FilterPill, Panel, RingChart } from '../../components/ui.tsx';

/**
 * Gate the whole application on the session.
 *
 * Nothing renders before the session resolves — no flash of the dashboard while auth is still
 * loading, which would briefly show structure to someone who may have no right to it.
 */
export default function App() {
  const { status } = useAuth();

  switch (status) {
    case 'loading':
      return <LoadingScreen />;
    case 'signed_out':
    case 'unconfigured':
      return <LoginScreen />;
    case 'no_access':
      return <NoAccessScreen />;
    case 'error':
      return <AccessErrorScreen />;
    case 'signed_in':
      return <Dashboard />;
  }
}

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
      return o !== null && o.photoState === 'missing';
    case 'alerts':
      return o?.hasRestrictedAlert === true;
  }
};

/**
 * Provenance banner.
 *
 * The figures are the real Primrose Lodge board; the people are not. Saying so on every screen
 * matters more than it looks: a plausible name beside a real admission date is exactly the thing
 * someone later quotes as fact.
 */
function ProvenanceBanner() {
  return (
    <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-[11px] font-medium text-amber-800 dark:text-amber-300">
      Primrose Lodge as recorded 21 Jul 2026 · real dates, durations and task states ·{' '}
      <strong className="font-semibold">client and staff names are pseudonyms</strong>
    </div>
  );
}

const initialsOf = (name: string): string =>
  name.split(/[\s.]+/).filter(Boolean).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();

/**
 * Identity, shown the same way on every screen — hub and centre workspace alike — rather than living
 * only in the sidebar footer where it used to sit. `variant` picks light-on-dark for the hub/chrome
 * header or dark-on-light for the centre workspace's panel header; the content is identical.
 *
 * A dropdown rather than a chip with its own "Sign out" button — matching the pattern ported from the
 * Lovable redesign's app shell. `onOpenAdmin` is omitted on the hub, which has no current centre for
 * "Administration" to mean anything about.
 */
function UserMenu({
  variant,
  onOpenAdmin,
}: {
  variant: 'chrome' | 'panel';
  onOpenAdmin?: (() => void) | undefined;
}) {
  const { displayName, email, roleNames, signOut } = useAuth();
  const name = displayName ?? email ?? 'Unknown user';
  const ink = variant === 'chrome' ? 'text-[var(--color-chrome-ink)]' : 'text-[var(--color-ink)]';
  const inkDim =
    variant === 'chrome' ? 'text-[var(--color-chrome-ink-dim)]' : 'text-[var(--color-ink-muted)]';
  const hoverBg = variant === 'chrome' ? 'hover:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition ${hoverBg}`}
        >
          <span
            aria-hidden="true"
            className={`grid size-8 shrink-0 place-items-center rounded-full bg-[var(--brand-purple)]/20 text-[11px] font-semibold ${ink}`}
          >
            {initialsOf(name)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className={`block text-[12.5px] font-medium ${ink}`}>{name}</span>
            <span className={`block text-[10.5px] ${inkDim}`}>
              {roleNames.length ? roleNames.join(', ') : 'No role'}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onOpenAdmin ? (
          <DropdownMenuItem onSelect={onOpenAdmin}>
            <ClipboardList className="size-4" /> Administration
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The centre switcher — a dropdown rather than a bare `<select>`, matching the source's own pattern.
 * Fictional occupancy/region figures still come from `centres-data.ts` (see the caveat where this is
 * built); this only changes how a centre is picked, not what's known about it. */
function CentreSwitcher({
  centres,
  value,
  onChange,
}: {
  centres: readonly CentreSummary[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const current = centres.find((c) => c.slug === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent-ring)] sm:flex"
        >
          <span className="max-w-[160px] truncate">{current?.name ?? 'Select centre'}</span>
          <ChevronDown className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-auto">
        <DropdownMenuLabel>Switch centre</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {centres.map((c) => (
          <DropdownMenuItem key={c.slug} onSelect={() => onChange(c.slug)}>
            <span className="min-w-0 flex-1 truncate">
              {c.name}
              {c.isConfigured ? '' : ' — no data'}
            </span>
            <span className="text-muted-foreground ml-auto shrink-0 text-xs">{c.region}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Header for the hub. Carries identity and sign-out, since there is no rail to hold them. */
function HubHeader() {
  const { centres } = useAuth();
  return (
    <header
      className="flex h-[64px] shrink-0 items-center gap-3 px-4 text-[var(--color-chrome-ink)] sm:px-6"
      style={{
        backgroundColor: 'var(--color-chrome)',
        backgroundImage:
          'linear-gradient(100deg,' +
          ' color-mix(in oklab, var(--brand-purple) 45%, transparent) 0%,' +
          ' color-mix(in oklab, var(--brand-pink) 22%, transparent) 55%,' +
          ' color-mix(in oklab, var(--brand-blue) 12%, transparent) 100%)',
      }}
    >
      <BrandMark />
      <div className="min-w-0">
        <div className="truncate font-display text-[15px] leading-tight font-semibold">
          UK Addiction Treatment Centres
        </div>
        <div className="nums truncate text-[11px] text-[var(--color-chrome-ink-dim)]">
          Treatment Operations · {centres.length} centres
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle className="text-[var(--color-chrome-ink-dim)] hover:bg-white/10 hover:text-[var(--color-chrome-ink)]" />
        <UserMenu variant="chrome" />
      </div>
    </header>
  );
}

const EMPTY_SUMMARY: BoardSummary = {
  bedsTotal: 0,
  bedsOccupied: 0,
  bedsAvailable: 0,
  occupancyPercent: 0,
  dueToday: 0,
  overdue: 0,
  notApplicable: 0,
  photoAttention: 0,
  restrictedAlerts: 0,
  dischargingWithin7Days: 0,
  pastPlannedDischarge: 0,
  missingTherapist: 0,
  dischargeMismatches: 0,
};

function Dashboard() {
  const [section, setSection] = useState('group');
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<FilterId>('all');
  const [therapistFilter, setTherapistFilter] = useState('all');
  const [view, setView] = useState<'board' | 'list'>('list');
  const [query, setQuery] = useState('');
  const [openBed, setOpenBed] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the search bar from anywhere in the centre workspace, matching the shortcut
  // hint shown next to it. No-op on the hub, which has no search bar to focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Which centre the Centre-level views are scoped to. Fictional summary stats (occupancy, overdue
  // counts) for the GROUP hub still come from centres-data.ts — that screen is a separate, larger
  // piece of work. The centre-level room board below reads real data.
  const centres = useMemo(() => buildCentres(), []);
  const [centreSlug, setCentreSlug] = useState('primrose-lodge');
  const centre = centres.find((c) => c.slug === centreSlug) ?? centres[0]!;

  // The REAL centre from Supabase, matched by slug.
  const { centres: authCentres } = useAuth();
  const authCentre = authCentres.find((c) => c.slug === centreSlug) ?? null;

  // The real room board. Replaces the fictional/frozen board that used to render unconditionally —
  // admitting a client through the real admission form now shows up here, because this is the same
  // database that form writes to.
  const [realBoard, setRealBoard] = useState<readonly BoardBed[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  // Bumped after a task is completed/reopened or a discharge action lands, to re-read the board rather
  // than patch local state to what we assume the server did. The server owns this state; this asks it
  // what happened — a discharge in particular can move an occupant off the board entirely.
  const [boardVersion, setBoardVersion] = useState(0);

  useEffect(() => {
    // Re-fetches on returning to this section, not only when the centre changes. Without `section`
    // in the dependency list, admitting a client and navigating back to the board showed the stale
    // pre-admission state — found by actually doing that in the browser, not by inspection.
    if (!authCentre || section !== 'board') return;
    let cancelled = false;
    setBoardLoading(true);
    buildRealBoard(authCentre.id)
      .then((result) => {
        if (cancelled) return;
        setRealBoard(result.board);
        setBoardError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBoardError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBoardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authCentre, section, boardVersion]);

  const board = realBoard;
  const summary = useMemo(() => (board.length ? summarise(board) : EMPTY_SUMMARY), [board]);

  const therapists = useMemo(
    () =>
      [...new Set(board.map((b) => b.occupant?.therapist).filter((t): t is string => Boolean(t)))].sort(),
    [board],
  );

  const q = query.trim().toLowerCase();
  const visible = board.filter((bed) => {
    if (!matchesFilter(bed, filter)) return false;
    if (therapistFilter !== 'all' && bed.occupant?.therapist !== therapistFilter) return false;
    if (!q) return true;
    const o = bed.occupant;
    return (
      bed.label.toLowerCase().includes(q) ||
      (o?.displayName.toLowerCase().includes(q) ?? false) ||
      (o?.reference.toLowerCase().includes(q) ?? false) ||
      (o?.therapist?.toLowerCase().includes(q) ?? false) ||
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
      photo: board.filter((b) => b.occupant?.photoState === 'missing').length,
      alerts: board.filter((b) => b.occupant?.hasRestrictedAlert).length,
    }),
    [board],
  );

  /*
   * Two shapes, not one.
   *
   * The hub lists centres and nothing else — no rail, because no rail item can act on ten centres at
   * once. Entering a centre swaps to a workspace whose every control is scoped to that centre.
   *
   * This mirrors how the centres actually run: independently, with no data crossing between them.
   */
  if (section === 'group') {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <ProvenanceBanner />
        <HubHeader />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <GroupDashboard
            onOpenCentre={(slug) => {
              setCentreSlug(slug);
              setSection('board');
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ProvenanceBanner />

      <div className="flex min-h-0 flex-1 overflow-hidden">
      <Sidebar
        active={section}
        onSelect={setSection}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        centreName={centre.name}
        onLeaveCentre={() => setSection('group')}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-[var(--color-ink-muted)] uppercase">
              UK Addiction Treatment Group
              {section !== 'group' ? (
                <>
                  <span aria-hidden="true">›</span>
                  {centre.region}
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[15px] leading-tight font-semibold">
                {section === 'group' ? 'All centres' : centre.name}
              </h1>
              <Chip label="Development" tone="warn" />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Centre selector. Hidden on the group view, which spans every centre by definition. */}
            {section !== 'group' ? (
              <CentreSwitcher centres={centres} value={centreSlug} onChange={setCentreSlug} />
            ) : null}
            <label className="relative hidden sm:block">
              <span className="sr-only">Search beds, clients, staff</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--color-ink-muted)]"
              />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bed, client, staff…"
                className="w-[220px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] py-1.5 pr-9 pl-7 text-[12.5px] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
              {/* A hint, not a control — the shortcut works everywhere in this workspace regardless
                  of whether this badge is visible, via the window-level listener above. */}
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1 py-0.5 text-[10px] text-[var(--color-ink-muted)]"
              >
                ⌘K
              </kbd>
            </label>
            <div className="nums hidden text-right text-[11px] leading-tight text-[var(--color-ink-muted)] lg:block">
              <div className="font-medium text-[var(--color-ink)]">
                {formatDateWithDay(new Date())}
              </div>
              <div>Europe/London</div>
            </div>
            <ThemeToggle />
            <UserMenu variant="panel" onOpenAdmin={authCentre ? () => setSection('admin') : undefined} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {isBoard && boardLoading ? (
            <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading the room board…</div>
          ) : isBoard && boardError ? (
            <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              Could not load the room board: {boardError}
            </div>
          ) : isBoard && board.length === 0 ? (
            <div className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-24 text-center">
              <div
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[18px] text-[var(--color-accent)]"
              >
                ▦
              </div>
              <h2 className="mt-3.5 text-[16px] font-semibold">
                {centre.name} is not configured yet
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
                It has no rooms or bed spaces in the database yet. Rather than show invented rooms,
                this page stays empty until they are entered under Administration.
              </p>
              <button
                type="button"
                onClick={() => setSection('admin')}
                className="mt-4 rounded-lg bg-[var(--color-ink)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-surface)]"
              >
                Go to Administration
              </button>
            </div>
          ) : isBoard ? (
            <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5">
              <section
                aria-label="Centre summary"
                className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7"
              >
                <MetricCard
                  icon={<BedDouble className="size-4" />}
                  label="Occupancy"
                  value={`${summary.bedsOccupied}/${summary.bedsTotal}`}
                  hint={`${summary.occupancyPercent}% · ${summary.bedsAvailable} free`}
                  accent="primary"
                />
                <MetricCard
                  icon={<TriangleAlert className="size-4" />}
                  label="Overdue"
                  value={summary.overdue}
                  accent={summary.overdue > 0 ? 'pink' : 'default'}
                  active={filter === 'overdue'}
                  actionLabel={filter === 'overdue' ? 'Clear filter' : 'View overdue'}
                  onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')}
                />
                <MetricCard
                  icon={<Clock className="size-4" />}
                  label="Due today"
                  value={summary.dueToday}
                  active={filter === 'due_today'}
                  actionLabel={filter === 'due_today' ? 'Clear filter' : 'View due today'}
                  onClick={() => setFilter(filter === 'due_today' ? 'all' : 'due_today')}
                />
                <MetricCard
                  icon={<CalendarClock className="size-4" />}
                  label="Discharging"
                  value={summary.dischargingWithin7Days}
                  hint="within 7 days"
                  active={filter === 'discharging'}
                  actionLabel={filter === 'discharging' ? 'Clear filter' : 'View discharging'}
                  onClick={() => setFilter(filter === 'discharging' ? 'all' : 'discharging')}
                />
                <MetricCard
                  icon={<Minus className="size-4" />}
                  label="Not applicable"
                  value={summary.notApplicable}
                  hint="beyond programme end"
                />
                <MetricCard
                  icon={<ImageOff className="size-4" />}
                  label="No photo"
                  value={summary.photoAttention}
                  active={filter === 'photo'}
                  actionLabel={filter === 'photo' ? 'Clear filter' : 'Review photos'}
                  onClick={() => setFilter(filter === 'photo' ? 'all' : 'photo')}
                />
                <MetricCard
                  icon={<Flag className="size-4" />}
                  label="Restricted"
                  value={summary.restrictedAlerts}
                  active={filter === 'alerts'}
                  actionLabel={filter === 'alerts' ? 'Clear filter' : 'View alerts'}
                  onClick={() => setFilter(filter === 'alerts' ? 'all' : 'alerts')}
                />
              </section>

              <Panel title="Occupancy" subtitle={centre.name} className="mt-4 sm:w-fit">
                <div className="flex items-center gap-4 py-1">
                  <RingChart
                    percent={summary.occupancyPercent}
                    value={`${summary.bedsOccupied}/${summary.bedsTotal}`}
                    label="Beds filled"
                  />
                  <div className="text-[11.5px] leading-relaxed text-[var(--color-ink-muted)]">
                    <span className="font-medium text-[var(--color-ink)]">{summary.bedsAvailable}</span>{' '}
                    available now
                  </div>
                </div>
              </Panel>

              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-soft">
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

                {therapists.length > 0 ? (
                  <select
                    value={therapistFilter}
                    onChange={(e) => setTherapistFilter(e.target.value)}
                    aria-label="Filter by therapist"
                    className="rounded-lg border border-[var(--color-line)] bg-card px-2 py-1.5 text-[11.5px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    <option value="all">All therapists</option>
                    {therapists.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : null}

                {/* Cards to glance, list to scan. Different jobs, so both stay. */}
                <div
                  role="group"
                  aria-label="View"
                  className="ml-auto flex overflow-hidden rounded-lg border border-[var(--color-line)]"
                >
                  {(['board', 'list'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium transition ${
                        view === v
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card text-muted-foreground hover:text-[var(--color-ink)]'
                      }`}
                    >
                      {v === 'board' ? (
                        <>
                          <LayoutGrid className="size-3.5" /> Cards
                        </>
                      ) : (
                        <>
                          <ListIcon className="size-3.5" /> List
                        </>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSection('admissions')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-[var(--color-accent-hover)]"
                >
                  <Plus className="size-3.5" /> Admit client
                </button>
              </div>

              <Panel title="Bed spaces" subtitle={`${visible.length} of ${board.length} shown`} className="mt-4">
                {visible.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-line)] py-14 text-center">
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
                ) : view === 'list' ? (
                  <section aria-label="Bed spaces">
                    <BedList beds={visible} onOpen={setOpenBed} />
                  </section>
                ) : (
                  <section
                    aria-label="Bed spaces"
                    className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
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

                <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
                  Room cards omit clinical detail by design. Substance, detox, medical and safeguarding
                  content appear nowhere on this board at any permission level — a restricted alert
                  shows as a flag only, with detail reachable through the client file by authorised
                  roles.
                </p>
              </Panel>
            </div>
          ) : section === 'admin' && authCentre ? (
            <Administration centre={authCentre} />
          ) : section === 'admissions' && authCentre ? (
            <AdmitClientForm centre={authCentre} />
          ) : section === 'clients' && authCentre ? (
            <ClientDirectory
              centre={authCentre}
              onOpenBed={(bedLabel) => {
                setSection('board');
                setOpenBed(bedLabel);
              }}
            />
          ) : section === 'audit' ? (
            <AuditHistory />
          ) : section === 'admin' || section === 'admissions' || section === 'clients' ? (
            <div className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-24 text-center">
              <div
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-xl bg-amber-500/12 text-[18px] text-amber-600 dark:text-amber-400"
              >
                &#9888;
              </div>
              <h2 className="mt-3.5 text-[16px] font-semibold">No matching centre in the database</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
                &ldquo;{centre.name}&rdquo; exists in the group overview but not in your accessible
                centres in Supabase, so there is nothing real to configure yet.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-24 text-center">
              <div
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              >
                {activeNav ? <activeNav.icon className="size-5" /> : null}
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
      </div>

      {selected ? (
        <DetailPanel
          bed={selected}
          onClose={() => setOpenBed(null)}
          onChanged={() => setBoardVersion((v) => v + 1)}
        />
      ) : null}
    </div>
  );
}
