import {
  BedDouble,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  LayoutGrid,
  ListChecks,
  Phone,
  Shield,
  Stethoscope,
  UserPlus,
  Users,
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
      { id: 'board', label: 'Room board', icon: BedDouble, ready: true },
      { id: 'clients', label: 'Clients', icon: Users, ready: true },
      { id: 'admissions', label: 'Admissions', icon: UserPlus, ready: true },
    ],
  },
  {
    heading: 'Work',
    items: [
      { id: 'my-work', label: 'My work', icon: ListChecks, ready: false },
      { id: 'tasks', label: 'All tasks', icon: ClipboardList, ready: false },
      { id: 'family', label: 'Family contact', icon: Phone, ready: false },
      { id: 'medical', label: 'Medical reviews', icon: Stethoscope, ready: false },
    ],
  },
  {
    heading: 'Oversight',
    items: [
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
  onLeaveCentre,
}: {
  active: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  centreName: string;
  onLeaveCentre: () => void;
}) {
  return (
    <nav
      aria-label="Main navigation"
      className={`flex shrink-0 flex-col bg-[var(--color-chrome)] text-[var(--color-chrome-ink)] transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* Always-dark chrome: the supplied UKAT mark is a white-on-transparent glyph, so this rail
          stays dark regardless of light/dark mode — recolouring someone's logo isn't an option, and a
          rail that flips brightness under it would make it unreadable half the time. */}
      <div className="flex h-16 items-center gap-2.5 border-b border-[var(--color-chrome-line)] px-3.5">
        <BrandMark className={collapsed ? 'mx-auto' : ''} />
        {!collapsed ? (
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-[13px] font-semibold text-[var(--color-chrome-ink)]">
              {centreName}
            </span>
            <span className="block truncate text-[10px] tracking-wide text-[var(--color-chrome-ink-dim)] uppercase">
              Treatment Operations
            </span>
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mb-4">
            {!collapsed ? (
              <div className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--color-chrome-ink-dim)] uppercase">
                {group.heading}
              </div>
            ) : (
              <div className="mx-2.5 mb-2 border-t border-[var(--color-chrome-line)]" />
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = item.id === active;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${
                        isActive
                          ? 'bg-[var(--color-chrome-raised)] font-semibold'
                          : 'text-[var(--color-chrome-ink-dim)] hover:bg-[var(--color-chrome-hover)] hover:text-[var(--color-chrome-ink)]'
                      }`}
                    >
                      {/* Brand pink as the active marker: a 3px bar, well above the size where its
                          contrast matters, and in the one region of the app where no status colour
                          is ever rendered next to it. */}
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-1/2 left-0 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--brand-pink)]"
                        />
                      ) : null}
                      <item.icon
                        aria-hidden="true"
                        className={`size-4 shrink-0 ${isActive ? 'text-[var(--brand-pink)]' : ''}`}
                      />
                      {!collapsed ? (
                        <>
                          <span className="flex-1 truncate text-left">{item.label}</span>
                          {!item.ready ? (
                            <span className="rounded bg-white/10 px-1 text-[9.5px] tracking-wide text-[var(--color-chrome-ink-dim)] uppercase">
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

        {/* The way back out, styled as its own nav group (matching the source's "Group" section)
            rather than a strip above the rail — always reachable, never a dead end inside a centre. */}
        <div>
          {!collapsed ? (
            <div className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--color-chrome-ink-dim)] uppercase">
              Group
            </div>
          ) : (
            <div className="mx-2.5 mb-2 border-t border-[var(--color-chrome-line)]" />
          )}
          <button
            type="button"
            onClick={onLeaveCentre}
            title={collapsed ? 'Back to group hub' : undefined}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--color-chrome-ink-dim)] transition hover:bg-[var(--color-chrome-hover)] hover:text-[var(--color-chrome-ink)]"
          >
            <LayoutGrid aria-hidden="true" className="size-4 shrink-0" />
            {!collapsed ? <span className="flex-1 truncate text-left">Back to group hub</span> : null}
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--color-chrome-line)] p-2">
        {/* Who's signed in lives in the top bar now — every screen shows it there, hub included, so it
            no longer needs a second copy here. This card is centre context instead: which centre
            "here" currently means, plus the nearest thing to a centre profile this product has today. */}
        {!collapsed ? (
          <div className="mb-2 rounded-lg bg-white/[0.06] px-2.5 py-2">
            <div className="text-[10px] tracking-wide text-[var(--color-chrome-ink-dim)] uppercase">
              Current centre
            </div>
            <div className="truncate text-[12.5px] font-medium">{centreName}</div>
            <button
              type="button"
              onClick={() => onSelect('admin')}
              className="mt-1.5 text-[11px] text-[var(--color-chrome-ink-dim)] underline underline-offset-2 transition hover:text-[var(--color-chrome-ink)]"
            >
              Manage this centre
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-chrome-ink-dim)] transition hover:bg-[var(--color-chrome-hover)] hover:text-[var(--color-chrome-ink)]"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}
          {!collapsed ? 'Collapse' : null}
        </button>
      </div>
    </nav>
  );
}
