import {
  BarChart3,
  BedDouble,
  Building2,
  CircleHelp,
  History,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Table2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Wordmark } from '../../components/brand.tsx';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  ready: boolean;
  badge?: number;
  onlyCentres?: readonly string[];
}

/** Two nav groups — workspace tools and oversight tools — matching the prototype's "WORKSPACE / MANAGE" sections. */
export const NAV_GROUPS: ReadonlyArray<{
  heading: string;
  caption: string;
  items: readonly NavItem[];
}> = [
  {
    heading: 'Centre',
    caption: 'WORKSPACE',
    items: [
      { id: 'overview',        label: 'Overview',         icon: BarChart3, ready: true },
      { id: 'treatment-board', label: 'Treatment Board',  icon: Table2,    ready: true },
      { id: 'board',           label: 'Room Board',       icon: BedDouble, ready: true },
      { id: 'clients',         label: 'Clients',          icon: Users,     ready: true },
    ],
  },
  {
    heading: 'Oversight',
    caption: 'MANAGE',
    items: [
      { id: 'audit', label: 'Activity Log',    icon: History, ready: true },
      { id: 'admin', label: 'Administration',  icon: Shield,  ready: true },
    ],
  },
];

export function Sidebar({
  active,
  onSelect,
  collapsed,
  onToggle,
  centreName,
  centreRegion,
  centreSlug,
  onLeaveCentre,
}: {
  active: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  centreName: string;
  centreRegion?: string;
  centreSlug?: string;
  onLeaveCentre: () => void;
}) {
  return (
    <nav
      aria-label="Main navigation"
      data-collapsed={String(collapsed)}
      className={`flex h-full flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] transition-[width] duration-200 overflow-hidden ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* ── Brand lockup ── */}
      <button
        type="button"
        onClick={onLeaveCentre}
        title="Back to group hub"
        className="brand-lockup hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] w-full text-left"
        style={{ padding: undefined }}
      >
        <Wordmark />
        <div className="brand-line" />
        <div className="brand-name">
          Treatment<span>Operations</span>
        </div>
      </button>

      {/* ── Centre box ── */}
      <div className="centre-box">
        <span className="centre-icon">
          <Building2 size={17} />
        </span>
        <div className="centre-copy grow">
          <strong>{centreName}</strong>
          <small>{centreRegion ?? 'UKAT'} · UKAT</small>
        </div>
      </div>

      {/* ── Scrollable nav area ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.heading}>
            {gi > 0 && <div className="nav-divider" />}
            <div className="nav-caption">{group.caption}</div>
            <nav className="nav-section" aria-label={group.heading}>
              {group.items
                .filter(item => !item.onlyCentres || item.onlyCentres.includes(centreSlug ?? ''))
                .map(item => {
                  const isActive = item.id === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item.id)}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={`nav-item ${isActive ? 'active' : ''}`}
                    >
                      <item.icon size={17} aria-hidden="true" />
                      <span className="nav-label">{item.label}</span>
                      {item.badge ? (
                        <span className="nav-count">{item.badge}</span>
                      ) : null}
                    </button>
                  );
                })}
            </nav>
          </div>
        ))}
      </div>

      {/* ── Bottom section ── */}
      <div className="nav-bottom">
        <button
          type="button"
          onClick={() => onSelect('help')}
          title={collapsed ? 'Guide & Help' : undefined}
          aria-current={active === 'help' ? 'page' : undefined}
          className={`nav-item ${active === 'help' ? 'active' : ''}`}
        >
          <CircleHelp size={17} aria-hidden="true" />
          <span className="nav-label">Guide & Help</span>
        </button>
        <button
          type="button"
          onClick={onLeaveCentre}
          title={collapsed ? 'Back to Group Hub' : undefined}
          className="nav-item"
        >
          <LayoutGrid size={17} aria-hidden="true" />
          <span className="nav-label">Back to Group Hub</span>
        </button>

        <div className="sidebar-foot">
          <div className="grow">
            <span className="foot-name">{centreName}</span>
            <span className="foot-sub">UKAT centre</span>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="icon-btn sidebar-collapse"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={17} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
