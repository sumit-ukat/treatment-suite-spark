import {
  BedDouble,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Gauge,
  History,
  LayoutGrid,
  Shield,
  Table2,
  UserPlus,
  Users,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { BrandMark } from '../../components/brand.tsx';

/**
 * Navigation.
 *
 * Not every destination is built yet. The rest are shown as real destinations rather than hidden,
 * because the shape of the product is part of what is being reviewed — but each unbuilt one is
 * explicitly marked "soon" (via `ready: false`) so the preview never implies a working feature.
 * Nothing here pretends. (The Lovable source this rail's styling is ported from has no equivalent —
 * its demo only models what's already built, so this grouping/badging is this app's own addition.)
 */
export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  ready: boolean;
  badge?: number;
  /** If set, the item only appears when the sidebar's centreSlug matches one of these values. */
  onlyCentres?: readonly string[];
}

/**
 * Navigation belongs to a centre, not to the group.
 *
 * The group view is a hub: a list of centres and nothing else. Its own navigation would be a rail of
 * items that cannot act on ten centres at once — "Room board" across the group is meaningless. So the
 * rail appears only once you are inside a centre, and everything in it is scoped to that centre.
 */
export const NAV_GROUPS: ReadonlyArray<{ heading: string; items: readonly NavItem[] }> = [
  {
    heading: 'Centre',
    items: [
      { id: 'overview', label: 'Overview', icon: BarChart3, ready: true },
      { id: 'treatment-board', label: 'Treatment board', icon: Table2, ready: true },
      { id: 'board', label: 'Room board', icon: BedDouble, ready: true },
      { id: 'clients', label: 'Clients', icon: Users, ready: true },
      { id: 'admissions', label: 'Admissions', icon: UserPlus, ready: true },
    ],
  },
  {
    heading: 'Oversight',
    items: [
      { id: 'incidents', label: 'Incident reports', icon: AlertTriangle, ready: true },
      { id: 'audit', label: 'Audit history', icon: History, ready: true },
      { id: 'admin', label: 'Administration', icon: Shield, ready: true },
    ],
  },
];

export function Sidebar({
  active,
  onSelect,
  collapsed,
  onToggle,
  centreName,
  centreSlug,
  onLeaveCentre,
  occupied,
  capacity,
}: {
  active: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  centreName: string;
  centreSlug?: string;
  onLeaveCentre: () => void;
  /** Today's real occupancy for the footer card — omitted (no footer) when the centre has no board
   * yet, rather than showing a fabricated 0/0. */
  occupied?: number | undefined;
  capacity?: number | undefined;
}) {
  return (
    <nav
      aria-label="Main navigation"
      className={`flex shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-panel)] transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* The brand mark is the conventional way back to the top of a product, and the group hub is
          what "the top" means here — the same destination as the "Back to group hub" item below,
          which stays because a logo is a convention, not a label. */}
      <button
        type="button"
        onClick={onLeaveCentre}
        title="Back to group hub"
        className="flex h-16 w-full items-center gap-2.5 px-3.5 text-left transition hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] dark:hover:bg-white/[0.06]"
      >
        <BrandMark className={collapsed ? 'mx-auto' : ''} />
        {!collapsed ? (
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[13px] font-semibold">Treatment Ops</span>
            <span className="block truncate text-[11px] text-[var(--color-ink-muted)]">UKAT group</span>
          </span>
        ) : null}
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        <div className="mb-4">
          {!collapsed ? (
            <div className="truncate px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--color-ink-muted)] uppercase">
              {centreName}
            </div>
          ) : (
            <div className="mx-2.5 mb-2 border-t border-[var(--color-line)]" />
          )}
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="mb-2">
              <ul className="flex flex-col gap-0.5">
                {group.items.filter((item) => !item.onlyCentres || item.onlyCentres.includes(centreSlug ?? '')).map((item) => {
                  const isActive = item.id === active;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.id)}
                        title={collapsed ? item.label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${
                          isActive
                            ? 'bg-primary-soft font-semibold text-primary'
                            : 'text-[var(--color-ink-muted)] hover:bg-muted/60 hover:text-[var(--color-ink)]'
                        }`}
                      >
                        <item.icon aria-hidden="true" className="size-4 shrink-0" />
                        {!collapsed ? (
                          <>
                            <span className="flex-1 truncate text-left">{item.label}</span>
                            {!item.ready ? (
                              <span className="rounded bg-muted px-1 text-[9.5px] tracking-wide text-[var(--color-ink-muted)] uppercase">
                                soon
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div>
          {!collapsed ? (
            <div className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--color-ink-muted)] uppercase">
              Group
            </div>
          ) : (
            <div className="mx-2.5 mb-2 border-t border-[var(--color-line)]" />
          )}
          <button
            type="button"
            onClick={onLeaveCentre}
            title={collapsed ? 'Back to group hub' : undefined}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--color-ink-muted)] transition hover:bg-muted/60 hover:text-[var(--color-ink)]"
          >
            <LayoutGrid aria-hidden="true" className="size-4 shrink-0" />
            {!collapsed ? <span className="flex-1 truncate text-left">Back to group hub</span> : null}
          </button>
          {/* Executive hub — absolute path so onSelect('/exec') navigates out of the centre shell */}
          <button
            type="button"
            onClick={() => onSelect('/exec')}
            title={collapsed ? 'Executive view' : undefined}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--color-ink-muted)] transition hover:bg-muted/60 hover:text-[var(--color-ink)]"
          >
            <Gauge aria-hidden="true" className="size-4 shrink-0" />
            {!collapsed ? <span className="flex-1 truncate text-left">Executive view</span> : null}
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--color-line)] p-2">
        {!collapsed && capacity ? (
          <div className="mb-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
            <p className="text-[11px] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
              Occupancy today
            </p>
            <p className="tabular font-display text-lg font-semibold">
              {occupied}
              <span className="text-[var(--color-ink-muted)]">/{capacity} beds</span>
            </p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-muted/60 hover:text-[var(--color-ink)]"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}
          {!collapsed ? 'Collapse' : null}
        </button>
      </div>
    </nav>
  );
}
