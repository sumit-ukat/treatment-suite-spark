import { useState } from 'react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { useAuth } from '../auth/AuthProvider.tsx';
import type { ClientSearchResult } from '../../services/data-access.js';
import { formatDate } from '../../lib/format.js';
import { Chip } from '../../components/ui.tsx';
import { useClientSearch } from './useClientSearch.js';
import { ClientFilePanel } from './ClientFilePanel.tsx';

/**
 * The first screen that lets staff find a client by name or reference, rather than only by already
 * having their bed open on the room board. Backed by `app.search_clients` (migration 0028) — see
 * that migration for why this is scoped to one centre rather than the whole organisation, and why a
 * caller lacking `clients.view_identity` can search by reference but not by name.
 *
 * A result opens `ClientFilePanel` — every admission this client has had at this centre, the first
 * place in the app a discharged client's history can be seen at all.
 */
export function ClientDirectory({ centre }: { centre: AccessibleCentre }) {
  const { can } = useAuth();
  const { query, setQuery, results, loading, error } = useClientSearch(centre.id);
  const [openClient, setOpenClient] = useState<ClientSearchResult | null>(null);

  const canSearch = can('clients.view_operational') || can('clients.view_identity');
  const canSeeNames = can('clients.view_identity');

  if (!canSearch) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to search clients at {centre.name}.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-5 py-8">
      <h2 className="text-[16px] font-semibold">Clients — {centre.name}</h2>
      <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
        {canSeeNames
          ? 'Search by name or reference. Only clients with an admission at this centre — past or present — appear here.'
          : 'Search by reference. Names are withheld for your role; only clients with an admission at this centre — past or present — appear here.'}
      </p>

      <label className="mt-5 block">
        <span className="sr-only">Search clients</span>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={canSeeNames ? 'Search by name or reference…' : 'Search by reference…'}
          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13.5px] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </label>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-[12.5px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-4">
        {query.trim().length > 0 && query.trim().length < 2 ? (
          <p className="text-[12px] text-[var(--color-ink-muted)]">Keep typing — at least 2 characters.</p>
        ) : loading ? (
          <p className="text-[12px] text-[var(--color-ink-muted)]">Searching…</p>
        ) : query.trim().length >= 2 && results.length === 0 ? (
          <p className="text-[12px] text-[var(--color-ink-muted)]">No clients matched at {centre.name}.</p>
        ) : results.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {results.map((r) => (
              <li key={r.client_id}>
                <button
                  type="button"
                  onClick={() => setOpenClient(r)}
                  className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-line)] px-3 py-2 text-left transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{r.display_name ?? r.reference}</div>
                    <div className="nums text-[11px] text-[var(--color-ink-muted)]">
                      {r.reference}
                      {r.last_admitted_at ? (
                        <>
                          {' '}
                          &middot; last admitted {formatDate(new Date(r.last_admitted_at))}
                        </>
                      ) : null}
                    </div>
                  </div>
                  {r.has_open_admission ? (
                    <Chip icon="&#9679;" label="Currently admitted" tone="good" />
                  ) : r.last_admission_status ? (
                    <Chip label={STATUS_LABEL[r.last_admission_status] ?? r.last_admission_status} />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[var(--color-ink-muted)]">
            Type at least 2 characters to search.
          </p>
        )}
      </div>

      {openClient ? (
        <ClientFilePanel client={openClient} centre={centre} onClose={() => setOpenClient(null)} />
      ) : null}
    </div>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  discharged: 'Discharged',
  cancelled: 'Cancelled',
  planned: 'Planned',
  active: 'Active',
};
