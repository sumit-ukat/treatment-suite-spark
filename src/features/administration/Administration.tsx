import { useState } from 'react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { RoomsAndBedsAdmin } from './RoomsAndBeds.tsx';
import { StaffDirectory } from './StaffDirectory.tsx';
import { UsersAndRoles } from './UsersAndRoles.tsx';

// ─── Root Administration component ───────────────────────────────────────────

export function Administration({ centre }: { centre: AccessibleCentre }) {
  const [tab, setTab] = useState<'staff' | 'rooms' | 'system'>('system');

  const TABS = [
    { id: 'staff',  label: 'Staff & permissions' },
    { id: 'rooms',  label: 'Rooms & beds' },
    { id: 'system', label: 'System access' },
  ] as const;

  return (
    <div>
      <div className="border-b border-[var(--color-line)] px-5 pt-4">
        <div role="tablist" aria-label="Administration" className="flex gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-t-md px-3 py-2 text-[12.5px] font-medium transition ${
                tab === id
                  ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'staff'  ? <StaffDirectory /> : null}
      {tab === 'rooms'  ? <RoomsAndBedsAdmin centre={centre} /> : null}
      {tab === 'system' ? <UsersAndRoles /> : null}
    </div>
  );
}
