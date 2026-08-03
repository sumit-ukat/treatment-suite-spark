import logoUrl from '../brand/prl-logo.svg';

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
      { id: 'admin', label: 'Administration', icon: '⚙', ready: false },
    ],
  },
];

export function Sidebar({
  active,
  onSelect,
  collapsed,
  onToggle,
}: {
  active: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <nav
      aria-label="Main navigation"
      className={`flex shrink-0 flex-col bg-[var(--color-chrome)] text-[var(--color-chrome-ink)] transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[228px]'
      }`}
    >
      <div
        className="flex h-[60px] items-center gap-2 border-b border-[var(--color-chrome-line)] px-4"
        style={{
          // The only place all three brand colours appear together: purple to pink to blue, behind
          // the logo. Purely decorative, carries no meaning and no text, so the contrast limits on
          // pink and blue do not apply here.
          backgroundImage:
            'linear-gradient(100deg,' +
            ' color-mix(in oklab, var(--brand-purple) 55%, transparent) 0%,' +
            ' color-mix(in oklab, var(--brand-pink) 30%, transparent) 45%,' +
            ' color-mix(in oklab, var(--brand-blue) 18%, transparent) 100%)',
        }}
      >
        <img
          src={logoUrl}
          alt="Primrose Lodge"
          className={`h-7 w-auto shrink-0 ${collapsed ? 'mx-auto' : ''}`}
        />
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
            <div className="truncate text-[12.5px] font-medium">Demo — Centre manager</div>
            <div className="truncate text-[11px] text-[var(--color-chrome-ink-dim)]">
              Primrose Lodge
            </div>
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
