import {
  BedDouble,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  History,
  LayoutGrid,
  LogOut,
  Shield,
  Stethoscope,
  Table2,
  UserPlus,
  Users,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { BrandMark } from '../../components/brand.tsx';
import { CentreSwitcher } from './CentreSwitcher.tsx';
import type { CentreSummary } from '../centres/centres-data.js';

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
    heading: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', icon: BarChart3, ready: true },
      { id: 'treatment-board', label: 'Treatment board', icon: Table2, ready: true },
      { id: 'board', label: 'Room board', icon: BedDouble, ready: true },
      { id: 'clients', label: 'Clients', icon: Users, ready: true },
      { id: 'discharge', label: 'Discharge', icon: LogOut, ready: true },
      { id: 'gp-summary', label: 'GP Summary', icon: Stethoscope, ready: true },
    ],
  },
  {
    heading: 'Manage',
    items: [
      // { id: 'incidents', label: 'Incident reports', icon: AlertTriangle, ready: true }, // hidden — restore when needed
      { id: 'audit', label: 'Activity log', icon: History, ready: true },
      { id: 'admin', label: 'Administration', icon: Shield, ready: true },
      // Rendered in the fixed bottom section, not this list — see Sidebar's nav-bottom block below.
      // Kept in this group's data (not deleted) so lookups elsewhere that flatten NAV_GROUPS still find it.
      { id: 'help', label: 'Guide & help', icon: HelpCircle, ready: true },
    ],
  },
];

/** A nav row shared by the grouped lists and the fixed bottom links — one definition so both
 * treatments (active state, badge, "soon" tag, collapsed title) stay in sync. */
function NavRow({ item, isActive, collapsed, onSelect }: {
  item: NavItem; isActive: boolean; collapsed: boolean; onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      title={collapsed ? item.label : undefined}
      aria-current={isActive ? 'page' : undefined}
      className={`flex h-[38px] w-full items-center gap-2.5 rounded-[7px] px-2.5 text-[12.5px] transition ${
        isActive
          ? 'bg-primary-soft font-semibold text-primary'
          : 'text-[var(--color-ink-muted)] hover:bg-muted/60 hover:text-[var(--color-ink)]'
      }`}
    >
      <item.icon aria-hidden="true" className="size-4 shrink-0" />
      {!collapsed ? (
        <>
          <span className="flex-1 truncate text-left">{item.label}</span>
          {item.badge ? (
            <span className="nums ml-auto rounded-full bg-[var(--color-accent)] px-[7px] py-px text-[10px] font-semibold text-white">
              {item.badge}
            </span>
          ) : !item.ready ? (
            <span className="rounded bg-muted px-1 text-[9.5px] tracking-wide text-[var(--color-ink-muted)] uppercase">
              soon
            </span>
          ) : null}
        </>
      ) : null}
    </button>
  );
}

export function Sidebar({
  active,
  onSelect,
  collapsed,
  onToggle,
  centreName,
  centreRegion,
  centreSlug,
  centres,
  onSwitchCentre,
  onLeaveCentre,
  occupied,
  capacity,
}: {
  active: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  centreName: string;
  /** e.g. "South East" — shown under the centre name, next to "UKAT". Omitted (no subtitle line)
   * when unknown, rather than showing a fabricated region. */
  centreRegion?: string | undefined;
  centreSlug?: string;
  /** All centres, for the centre-box's switcher dropdown. Omitted (or without onSwitchCentre) falls
   * back to a plain, non-interactive centre card instead of a dropdown with nothing to switch to. */
  centres?: readonly CentreSummary[] | undefined;
  onSwitchCentre?: ((slug: string) => void) | undefined;
  onLeaveCentre: () => void;
  /** Today's real occupancy for the footer card — omitted (no footer) when the centre has no board
   * yet, rather than showing a fabricated 0/0. */
  occupied?: number | undefined;
  capacity?: number | undefined;
}) {
  const helpItem = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === 'help');

  return (
    <nav
      aria-label="Main navigation"
      className={`flex h-full shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-panel)] transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* Brand lockup — the logo is the conventional way back to the top of a product, and the group
          hub is what "the top" means here, the same destination as "Back to group hub" below. */}
      <button
        type="button"
        onClick={onLeaveCentre}
        title="Back to group hub"
        className={`flex h-[72px] w-full shrink-0 items-center gap-2.5 border-b border-[var(--color-line)] px-3.5 text-left transition hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] dark:hover:bg-white/[0.06] ${
          collapsed ? 'justify-center px-2' : ''
        }`}
      >
        <BrandMark className={collapsed ? 'mx-auto' : ''} />
        {!collapsed ? (
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[13.5px] font-semibold">Treatment Ops</span>
            <span className="block truncate text-[11px] text-[var(--color-ink-muted)]">UKAT group</span>
          </span>
        ) : null}
      </button>

      {/* Centre card — a switcher when there's a centre list to switch between, else a plain card */}
      {centres && onSwitchCentre ? (
        <div className={collapsed ? 'mx-2.5 my-3 flex shrink-0 justify-center' : 'mx-3 my-3.5 shrink-0'}>
          <CentreSwitcher
            centres={centres}
            value={centreSlug ?? ''}
            onChange={onSwitchCentre}
            trigger={() =>
              collapsed ? (
                <button
                  type="button"
                  title={`${centreName} — switch centre`}
                  className="grid size-[31px] shrink-0 place-items-center rounded-[7px] bg-[var(--color-accent-soft)] text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/20"
                >
                  <Building2 aria-hidden="true" className="size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  title="Switch centre"
                  className="flex min-h-[54px] w-full items-center gap-2.5 rounded-[8px] border border-[var(--color-accent)]/35 bg-[var(--color-accent-soft)]/40 px-2.5 py-2.5 text-left transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                >
                  <span className="grid size-[31px] shrink-0 place-items-center rounded-[7px] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                    <Building2 aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <strong className="block truncate text-[12px] font-semibold text-[var(--color-ink)]">{centreName}</strong>
                    {centreRegion ? (
                      <small className="block truncate text-[11px] text-[var(--color-ink-muted)]">{centreRegion} · UKAT</small>
                    ) : null}
                  </span>
                  <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-[var(--color-accent)]" />
                </button>
              )
            }
          />
        </div>
      ) : !collapsed ? (
        <div className="mx-3 my-3.5 flex min-h-[54px] shrink-0 items-center gap-2.5 rounded-[8px] border border-[var(--color-line)] px-2.5 py-2.5">
          <span className="grid size-[31px] shrink-0 place-items-center rounded-[7px] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 leading-tight">
            <strong className="block truncate text-[12px] font-semibold text-[var(--color-ink)]">{centreName}</strong>
            {centreRegion ? (
              <small className="block truncate text-[11px] text-[var(--color-ink-muted)]">{centreRegion} · UKAT</small>
            ) : null}
          </span>
        </div>
      ) : (
        <div className="mx-2.5 my-3 flex shrink-0 justify-center">
          <span className="grid size-[31px] shrink-0 place-items-center rounded-[7px] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.heading}>
            {i > 0 ? (
              collapsed ? (
                <div className="mx-1 my-3 border-t border-[var(--color-line)]" />
              ) : (
                <div className="my-3 border-t border-[var(--color-line)]" />
              )
            ) : null}
            {!collapsed ? (
              <div className="truncate px-2.5 pb-2 text-[10.5px] font-semibold tracking-[0.1em] text-[var(--color-ink-muted)] uppercase">
                {group.heading}
              </div>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items
                .filter((item) => item.id !== 'help')
                .filter((item) => !item.onlyCentres || item.onlyCentres.includes(centreSlug ?? ''))
                .map((item) => (
                  <li key={item.id}>
                    <NavRow item={item} isActive={item.id === active} collapsed={collapsed} onSelect={onSelect} />
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Fixed bottom links — always reachable regardless of scroll position, matching the reference
          board's nav-bottom pattern. Guide & help lives here (its data stays in the Manage group above
          so lookups that flatten NAV_GROUPS still find it) alongside Back to group hub. */}
      <div className="shrink-0 px-3 py-2">
        {helpItem ? (
          <NavRow item={helpItem} isActive={helpItem.id === active} collapsed={collapsed} onSelect={onSelect} />
        ) : null}
        <button
          type="button"
          onClick={onLeaveCentre}
          title={collapsed ? 'Back to group hub' : undefined}
          className="flex h-[38px] w-full items-center gap-2.5 rounded-[7px] px-2.5 text-[12.5px] text-[var(--color-ink-muted)] transition hover:bg-muted/60 hover:text-[var(--color-ink)]"
        >
          <LayoutGrid aria-hidden="true" className="size-4 shrink-0" />
          {!collapsed ? <span className="flex-1 truncate text-left">Back to group hub</span> : null}
        </button>
      </div>

      <div className="shrink-0 border-t border-[var(--color-line)] p-2">
        {!collapsed && capacity ? (
          <div className="mb-2 rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
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
          className="flex w-full items-center justify-center gap-2 rounded-[7px] px-2 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-muted/60 hover:text-[var(--color-ink)]"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}
          {!collapsed ? 'Collapse' : null}
        </button>
      </div>
    </nav>
  );
}
