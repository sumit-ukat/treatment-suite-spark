import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  ChevronDown,
  ClipboardList,
  Filter,
  LayoutGrid,
  List as ListIcon,
  LogOut,
  Plus,
  Search,
} from 'lucide-react';
import { summarise, type BoardBed, type BoardSummary } from '../rooms/board-data.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { daysLeftInWeek } from '../../domain/zoned-time.js';
import { useBoardData } from '../rooms/use-board-data.js';
import { buildCentres, type CentreSummary } from '../centres/centres-data.js';
import { BrandMark } from '../../components/brand.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import { ThemeToggle } from '../../components/theme-toggle.tsx';
import { LiveClock } from '../../components/live-clock.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.tsx';
import { useAuth, type AccessibleCentre } from '../auth/AuthProvider.tsx';
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
import { TreatmentBoard } from '../rooms/TreatmentBoard.tsx';
import { NAV_GROUPS, Sidebar } from './Sidebar.tsx';
import { Chip } from '../../components/ui.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx';

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
      return (
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      );
  }
}

/**
 * URL structure.
 *
 * `/hub` is the group overview; everything else is scoped under `/centre/:centreSlug/...`, matching
 * the Lovable-sourced redesign's own routing exactly (see the URL-structure sheet this was written
 * alongside). Only `primrose-lodge` has a real accessible centre behind it today — every other slug
 * still resolves and renders (so a bookmark or a shared link never 404s), it just falls through to
 * the same "no matching centre in the database" state the old section-based nav already showed for
 * an unconfigured centre. Nothing about the other nine centres changed; they were never wired to real
 * data before this, and still aren't.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/hub" replace />} />
      <Route path="/hub" element={<HubPage />} />
      <Route path="/centre/:centreSlug" element={<CentreShell />}>
        <Route index element={<Navigate to="treatment-board" replace />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="admissions" element={<AdmissionsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="my-work" element={<NotBuiltPage />} />
        <Route path="tasks" element={<NotBuiltPage />} />
        <Route path="family" element={<NotBuiltPage />} />
        <Route path="medical" element={<NotBuiltPage />} />
        <Route path="treatment-board" element={<TreatmentBoardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/hub" replace />} />
    </Routes>
  );
}

// TODO: same scoped simplification as elsewhere — every configured centre today is Europe/London.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

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
      // The rest of this calendar week, matching the hub's "Discharges this week" — a rolling seven
      // days would give the two screens different answers to the same question.
      return o !== null && o.daysUntilDischarge <= daysLeftInWeek(new Date(), TZ);
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

/** Header for the hub — a plain sticky light bar, matching the source exactly, not this app's dark
 * chrome treatment used everywhere else. The BrandMark still carries its own gradient-filled icon
 * box, so it reads fine here regardless of the header background around it. */
function HubHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-panel)]/85 px-4 backdrop-blur sm:px-6">
      <BrandMark />
      <div className="min-w-0">
        <div className="truncate font-display text-[15px] leading-tight font-semibold">
          Treatment Operations
        </div>
        <div className="truncate text-[11px] text-[var(--color-ink-muted)]">Group hub</div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <LiveClock className="hidden sm:flex" />
        <ThemeToggle />
        <UserMenu variant="panel" />
      </div>
    </header>
  );
}

/** `/hub` — no rail, because no rail item can act on ten centres at once. Entering a centre (`/centre/
 * :centreSlug/board`) swaps to a workspace whose every control is scoped to that one centre. */
function HubPage() {
  const navigate = useNavigate();
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ProvenanceBanner />
      <HubHeader />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <GroupDashboard onOpenCentre={(slug) => navigate(`/centre/${slug}/treatment-board`)} />
      </main>
    </div>
  );
}

interface CentreContext {
  centre: CentreSummary;
  centres: readonly CentreSummary[];
  authCentre: AccessibleCentre | null;
  query: string;
  setQuery: (q: string) => void;
}

/** Every page under `/centre/:centreSlug` reads its centre via this instead of its own lookup, so a
 * bookmarked or shared link resolves the same centre the sidebar and top bar already agree on. */
function useCentreContext(): CentreContext {
  return useOutletContext<CentreContext>();
}

/**
 * The sidebar + top bar shell shared by every centre-scoped page, rendered once per `:centreSlug` and
 * left in place across nested route changes — `<Outlet/>` swaps only the page content, matching how
 * the old section switch never remounted the shell either.
 */
function CentreShell() {
  const { centreSlug = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the search bar from anywhere in the centre workspace, matching the shortcut
  // hint shown next to it.
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

  // Fictional summary stats (occupancy, overdue counts) for the GROUP hub still come from
  // centres-data.ts — that screen is a separate, larger piece of work. Centre-level pages below read
  // real data through `authCentre` instead.
  const centres = useMemo(() => buildCentres(), []);
  const centre = centres.find((c) => c.slug === centreSlug) ?? centres[0]!;

  const { centres: authCentres } = useAuth();
  const authCentre = authCentres.find((c) => c.slug === centreSlug) ?? null;

  const activeId = location.pathname.split('/').filter(Boolean).pop() ?? 'board';

  const context: CentreContext = { centre, centres, authCentre, query, setQuery };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ProvenanceBanner />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          active={activeId}
          onSelect={(id) => navigate(id)}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          centreName={centre.name}
          centreSlug={centreSlug}
          onLeaveCentre={() => navigate('/hub')}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-[var(--color-ink-muted)] uppercase">
                UK Addiction Treatment Group
                <span aria-hidden="true">›</span>
                {centre.region}
              </div>
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-[15px] leading-tight font-semibold">
                  {centre.name}
                </h1>
                <Chip label="Development" tone="warn" />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <CentreSwitcher
                centres={centres}
                value={centreSlug}
                onChange={(slug) => navigate(`/centre/${slug}/treatment-board`)}
              />
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
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1 py-0.5 text-[10px] text-[var(--color-ink-muted)]"
                >
                  ⌘K
                </kbd>
              </label>
              <LiveClock className="hidden lg:flex" />
              <ThemeToggle />
              <UserMenu variant="panel" onOpenAdmin={authCentre ? () => navigate('admin') : undefined} />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1500px]">
              <Outlet context={context} />
            </div>
          </main>
        </div>
      </div>
    </div>
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
  dischargingThisWeek: 0,
  pastPlannedDischarge: 0,
  missingTherapist: 0,
  dischargeMismatches: 0,
};

/** `/centre/:centreSlug/board` — the one page with meaningful state of its own (filters, view mode,
 * which bed's detail panel is open), so it keeps that state locally rather than in the shell. */
function BoardPage() {
  const { centre, authCentre, query, setQuery } = useCentreContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterId>('all');
  const [therapistFilter, setTherapistFilter] = useState('all');
  const [view, setView] = useState<'board' | 'list'>('board');

  const {
    beds: board,
    loading: boardLoading,
    refreshing: boardRefreshing,
    error: boardError,
    refresh: refreshBoard,
  } = useBoardData(authCentre?.id);
  // The available bed a "admit here?" confirmation is open for — a separate confirm step, not a
  // straight jump to the admission form, since clicking an empty bed is otherwise a single misclick
  // away from the full admit-a-client flow.
  const [confirmBed, setConfirmBed] = useState<BoardBed | null>(null);

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

  // Which bed's detail panel is open lives in the URL (?bed=), not local state — so opening one from
  // the client directory, or sharing/reloading the link, lands on the same panel.
  const openBedLabel = searchParams.get('bed');
  const selected = board.find((b) => b.label === openBedLabel) ?? null;
  const openBed = (label: string) => setSearchParams({ bed: label });
  const closeBed = () => setSearchParams({});

  const counts = useMemo(
    () => ({
      occupied: board.filter((b) => b.occupant).length,
      available: board.filter((b) => !b.occupant).length,
      overdue: board.filter((b) => (b.occupant?.overdueCount ?? 0) > 0).length,
      dueToday: board.filter((b) => (b.occupant?.dueTodayCount ?? 0) > 0).length,
      discharging: board.filter(
        (b) => b.occupant && b.occupant.daysUntilDischarge <= daysLeftInWeek(new Date(), TZ),
      ).length,
      photo: board.filter((b) => b.occupant?.photoState === 'missing').length,
      alerts: board.filter((b) => b.occupant?.hasRestrictedAlert).length,
    }),
    [board],
  );

  if (boardLoading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading the room board…</div>;
  }
  if (boardError) {
    return (
      <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not load the room board: {boardError}
      </div>
    );
  }
  if (!authCentre) {
    return <NoMatchingCentre centreName={centre.name} />;
  }
  if (board.length === 0) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-24 text-center">
        <div
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[18px] text-[var(--color-accent)]"
        >
          ▦
        </div>
        <h2 className="mt-3.5 text-[16px] font-semibold">{centre.name} is not configured yet</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
          It has no rooms or bed spaces in the database yet. Rather than show invented rooms, this page
          stays empty until they are entered under Administration.
        </p>
        <button
          type="button"
          onClick={() => navigate('../admin')}
          className="mt-4 rounded-lg bg-[var(--color-ink)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-surface)]"
        >
          Go to Administration
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-5 sm:px-5">
      <PageHeader
        eyebrow={centre.county}
        title={`${centre.name} room board`}
        description={`${summary.bedsOccupied} of ${summary.bedsTotal} beds occupied · ${counts.overdue} beds with overdue actions${boardRefreshing ? ' · Updating…' : ''}`}
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-[var(--color-line)]">
              {(['board', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold transition ${
                    view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
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
              onClick={() => navigate('../admissions')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-[12.5px] font-semibold text-white transition hover:bg-[var(--color-accent-hover)]"
            >
              <Plus className="size-4" /> Admit client
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-soft">
        <span className="flex items-center gap-1.5 pl-1 text-xs font-semibold text-muted-foreground">
          <Filter className="size-3.5" /> Filters
        </span>
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bed, client or therapist"
            aria-label="Search the board"
            className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12.5px] transition focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterId)}
          aria-label="Filter by status"
          className="h-9 rounded-lg border border-[var(--color-line)] bg-card px-2.5 text-[12.5px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="available">Available beds</option>
          <option value="overdue">Overdue</option>
          <option value="due_today">Due today</option>
          <option value="discharging">Discharging this week</option>
          <option value="photo">No photograph</option>
          <option value="alerts">Restricted alert</option>
        </select>
        {therapists.length > 0 ? (
          <select
            value={therapistFilter}
            onChange={(e) => setTherapistFilter(e.target.value)}
            aria-label="Filter by therapist"
            className="h-9 rounded-lg border border-[var(--color-line)] bg-card px-2.5 text-[12.5px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="all">All therapists</option>
            {therapists.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : null}
        <span className="tabular ml-auto pr-1 text-xs text-muted-foreground">
          {visible.length} beds shown
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] py-14 text-center">
          <div className="text-[13px] font-medium">No bed spaces match</div>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setTherapistFilter('all');
              setQuery('');
            }}
            className="mt-1.5 text-[12px] text-[var(--color-accent)] underline underline-offset-2"
          >
            Clear filters
          </button>
        </div>
      ) : view === 'list' ? (
        <section aria-label="Bed spaces">
          <BedList beds={visible} onOpen={openBed} onOpenAvailable={(label) => setConfirmBed(board.find((b) => b.label === label) ?? null)} />
        </section>
      ) : (
        <section
          aria-label="Bed spaces"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        >
          {visible.map((bed) =>
            bed.occupant ? (
              <OccupiedCard key={bed.label} bed={bed} onOpen={() => openBed(bed.label)} />
            ) : (
              <AvailableCard key={bed.label} bed={bed} onOpen={() => setConfirmBed(bed)} />
            ),
          )}
        </section>
      )}

      <Dialog open={confirmBed !== null} onOpenChange={(open) => !open && setConfirmBed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bed {confirmBed?.label} is available</DialogTitle>
            <DialogDescription>
              Admit a new client into this bed? You'll fill in their details on the next screen — nothing
              is saved yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmBed(null)}
              className="rounded-lg border border-[var(--color-line)] px-3.5 py-2 text-[12.5px] font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const label = confirmBed?.label;
                setConfirmBed(null);
                if (label) navigate(`../admissions?bed=${encodeURIComponent(label)}`);
              }}
              className="rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-[12.5px] font-medium text-white"
            >
              Yes, admit a client
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="max-w-3xl text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
        Room cards omit clinical detail by design. Substance, detox, medical and safeguarding content
        appear nowhere on this board at any permission level — a restricted alert shows as a flag
        only, with detail reachable through the client file by authorised roles.
      </p>

      {selected ? (
        <DetailPanel
          bed={selected}
          centreId={authCentre.id}
          onClose={closeBed}
          onChanged={() => refreshBoard()}
        />
      ) : null}
    </div>
  );
}

function NoMatchingCentre({ centreName }: { centreName: string }) {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-24 text-center">
      <div
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-xl bg-amber-500/12 text-[18px] text-amber-600 dark:text-amber-400"
      >
        &#9888;
      </div>
      <h2 className="mt-3.5 text-[16px] font-semibold">No matching centre in the database</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
        &ldquo;{centreName}&rdquo; exists in the group overview but not in your accessible centres in
        Supabase, so there is nothing real to configure yet.
      </p>
    </div>
  );
}

function ClientsPage() {
  const { centre, authCentre } = useCentreContext();
  const navigate = useNavigate();
  if (!authCentre) return <NoMatchingCentre centreName={centre.name} />;
  return (
    <ClientDirectory
      centre={authCentre}
      onOpenBed={(bedLabel) => navigate(`../board?bed=${encodeURIComponent(bedLabel)}`)}
    />
  );
}

function AdmissionsPage() {
  const { centre, authCentre } = useCentreContext();
  if (!authCentre) return <NoMatchingCentre centreName={centre.name} />;
  return <AdmitClientForm centre={authCentre} />;
}

function AdminPage() {
  const { centre, authCentre } = useCentreContext();
  if (!authCentre) return <NoMatchingCentre centreName={centre.name} />;
  return <Administration centre={authCentre} />;
}

function AuditPage() {
  return <AuditHistory />;
}

function TreatmentBoardPage() {
  const { centre, authCentre } = useCentreContext();
  if (!authCentre) return <NoMatchingCentre centreName={centre.name} />;
  return <TreatmentBoard centreId={authCentre.id} centreName={centre.name} />;
}

/** The four "soon" nav items (My work, All tasks, Family contact, Medical reviews) all land here —
 * real destinations in the nav rather than hidden, each explicitly marked "soon" there, and each
 * rendering nothing rather than a faked screen once actually opened. */
function NotBuiltPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeId = location.pathname.split('/').filter(Boolean).pop();
  const activeNav = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeId);
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center px-5 py-24 text-center">
      <div
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
      >
        {activeNav ? <activeNav.icon className="size-5" /> : null}
      </div>
      <h2 className="mt-3.5 text-[16px] font-semibold">{activeNav?.label}</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
        Not built yet. It appears in the navigation so the shape of the product is reviewable — but
        nothing here is faked, so there is no screen to show.
      </p>
      <button
        type="button"
        onClick={() => navigate('../board')}
        className="mt-4 rounded-lg bg-[var(--color-ink)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-surface)]"
      >
        Back to room board
      </button>
    </div>
  );
}
