import { useState } from 'react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { RoomsAndBedsAdmin } from './RoomsAndBeds.tsx';
import { UsersAndRoles } from './UsersAndRoles.tsx';

/**
 * The "Administration" nav item's two concerns, tabbed rather than given separate nav entries.
 * Rooms & Beds is genuinely scoped to `centre` (a room belongs to one centre); Users & Roles is not
 * (a person's access can span an organisation, a zone, or one centre) — see UsersAndRoles.tsx's own
 * header comment. Both live under one nav item because both are administrative, not because they
 * share a scope.
 */
export function Administration({ centre }: { centre: AccessibleCentre }) {
  const [tab, setTab] = useState<'rooms' | 'users'>('rooms');

  return (
    <div>
      <div className="border-b border-[var(--color-line)] px-5 pt-4">
        <div role="tablist" aria-label="Administration" className="flex gap-1">
          {(
            [
              ['rooms', 'Rooms & beds'],
              ['users', 'Users & roles'],
            ] as const
          ).map(([id, label]) => (
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

      {tab === 'rooms' ? <RoomsAndBedsAdmin centre={centre} /> : <UsersAndRoles />}
    </div>
  );
}
