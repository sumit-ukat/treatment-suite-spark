import markUrl from '../../assets/brand/ukat-mark.png';
import { useAuth } from '../auth/AuthProvider.tsx';

/**
 * Navigation.
 *
 * Only Room Board is built. The rest are shown as real destinations rather than hidden, because the
 * shape of the product is part of what is being reviewed — but each is explicitly marked "soon" so
 * the preview never implies working features. Nothing here pretends.
 */
export interface NavItem {
  id: string;
  label: string;
  icon: string;
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
      { id: 'board', label: 'Room board', icon: '▦', ready: true },
      { id: 'clients', label: 'Clients', icon: '☰', ready: false },
      { id: 'admissions', label: 'Admissions', icon: '↳', ready: false },
    ],
  },
  {
    heading: 'Work',
    items: [
      { id: 'my-work', label: 'My work', icon: '◉', ready: false },
      { id: 'tasks', label: 'All tasks', icon: '✓', ready: false },
      { id: 'family', label: 'Family contact', icon: '☏', ready: false },
      { id: 'medical', label: 'Medical reviews', icon: '✚', ready: false },
    ],
  },
  {
    heading: 'Oversight',
    items: [
      { id: 'reports', label: 'Reports', icon: '▤', ready: false },
      { id: 'audit', label: 'Audit history', icon: '◷', ready: false },
      { id: 'admin', label: 'Administration', icon: '⚙', ready: true },
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
  const { displayName, email, roleNames, permissions, signOut } = useAuth();

  return (
    <nav
      aria-label="Main navigation"
      className={`flex shrink-0 flex-col bg-[var(--color-chrome)] text-[var(--color-chrome-ink)] transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[228px]'
      }`}
    >
      {/*
        The textless mark, not the wordmark.
        The supplied wordmark has navy "UK" and grey "Centres" set for a white background; on this
        dark chrome it would be close to illegible, and recolouring someone's logo is not an option.
        The mark is full-colour on transparent, so it reads on any background — which is exactly what
        a compact, collapsible rail needs. The wordmark gets used unmodified on the sign-in screen,
        where the background is white.
      */}
      <div
        className="flex h-[60px] items-center gap-2.5 border-b border-[var(--color-chrome-line)] px-4"
        style={{
          backgroundImage:
            'linear-gradient(100deg,' +
            ' color-mix(in oklab, var(--brand-purple) 45%, transparent) 0%,' +
            ' color-mix(in oklab, var(--brand-pink) 24%, transparent) 50%,' +
            ' color-mix(in oklab, var(--brand-blue) 14%, transparent) 100%)',
        }}
      >
        <img
          src={markUrl}
          alt="UK Addiction Treatment Centres"
          width={256}
          height={256}
          className={`h-8 w-8 shrink-0 object-contain ${collapsed ? 'mx-auto' : ''}`}
        />
        {!collapsed ? (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[12.5px] font-semibold text-[var(--color-chrome-ink)]">
              {centreName}
            </span>
            <span className="block truncate text-[9.5px] tracking-wide text-[var(--color-chrome-ink-dim)] uppercase">
              Treatment Operations
            </span>
          </span>
        ) : null}
      </div>

      {/* The way back out. Always the first thing in the rail, so the current centre is never a
          place you can get stuck inside. */}
      <button
        type="button"
        onClick={onLeaveCentre}
        title={collapsed ? 'All centres' : undefined}
        className="flex items-center gap-2 border-b border-[var(--color-chrome-line)] px-4 py-2.5 text-[11.5px] text-[var(--color-chrome-ink-dim)] transition hover:bg-[var(--color-chrome-hover)] hover:text-[var(--color-chrome-ink)]"
      >
        <span aria-hidden="true">&#8592;</span>
        {!collapsed ? <span>All centres</span> : null}
      </button>

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
                      <span
                        aria-hidden="true"
                        className={`w-4 shrink-0 text-center text-[13px] ${
                          isActive ? 'text-[var(--brand-pink)]' : ''
                        }`}
                      >
                        {item.icon}
                      </span>
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
      </div>

      <div className="border-t border-[var(--color-chrome-line)] p-2">
        {!collapsed ? (
          <div className="mb-2 rounded-lg bg-white/[0.06] px-2.5 py-2">
            <div className="text-[10px] tracking-wide text-[var(--color-chrome-ink-dim)] uppercase">
              Signed in as
            </div>
            <div className="truncate text-[12.5px] font-medium">
              {displayName ?? email ?? 'Unknown user'}
            </div>
            <div className="truncate text-[11px] text-[var(--color-chrome-ink-dim)]">
              {roleNames.length ? roleNames.join(', ') : 'No role'}
            </div>
            <div className="nums mt-1 text-[10px] text-[var(--color-chrome-ink-dim)]">
              <span title="Permissions granted to this account">{permissions.size} permissions</span>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-2 w-full rounded-md border border-[var(--color-chrome-line)] px-2 py-1 text-[11.5px] text-[var(--color-chrome-ink-dim)] transition hover:bg-[var(--color-chrome-hover)] hover:text-[var(--color-chrome-ink)]"
            >
              Sign out
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-chrome-ink-dim)] transition hover:bg-[var(--color-chrome-hover)] hover:text-[var(--color-chrome-ink)]"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          {!collapsed ? 'Collapse' : null}
        </button>
      </div>
    </nav>
  );
}
