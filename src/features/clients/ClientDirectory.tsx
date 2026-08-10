import { Filter, Search } from 'lucide-react';
import { useState } from 'react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { useAuth } from '../auth/AuthProvider.tsx';
import type { ClientSearchResult } from '../../services/data-access.js';
import { formatDate } from '../../lib/format.js';
import { Chip } from '../../components/ui.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import { StatusBadge } from '../../components/status-badge.tsx';
import { ClientAvatar } from '../../components/brand.tsx';
import { useClientSearch } from './useClientSearch.js';
import { ClientFilePanel } from './ClientFilePanel.tsx';

/** Initials and a stable 0-2 hue, both derived from real fields rather than stored — a client search
 * result has no "avatar colour" of its own, and shouldn't grow one just to feed ClientAvatar. */
function initialsOf(name: string): string {
  return name.split(/[\s.]+/).filter(Boolean).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
}
function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The first screen that lets staff find a client by name or reference, rather than only by already
 * having their bed open on the room board. Backed by `app.search_clients` (migration 0028, listing
 * everyone by default since migration 0032) — see those migrations for why this is scoped to one
 * centre rather than the whole organisation, and why a caller lacking `clients.view_identity` can
 * search by reference but not by name.
 *
 * A result opens `ClientFilePanel` — every admission this client has had at this centre, the first
 * place in the app a discharged client's history can be seen at all.
 */
export function ClientDirectory({
  centre,
  onOpenBed,
}: {
  centre: AccessibleCentre;
  /** Jumps to the client's live bed on the room board — only meaningful when they're currently
   * resident, so ClientFilePanel only offers it then. */
  onOpenBed?: ((bedLabel: string) => void) | undefined;
}) {
  const { can } = useAuth();
  const { query, setQuery, results, loading, error } = useClientSearch(centre.id);
  const [openClient, setOpenClient] = useState<ClientSearchResult | null>(null);
  const [scope, setScope] = useState<'all' | 'current' | 'former'>('all');

  const canSearch = can('clients.view_operational') || can('clients.view_identity');
  const canSeeNames = can('clients.view_identity');

  // Filters whatever a search already returned — it does not fetch more than the search itself
  // already asked for.
  const visible = results.filter((r) => {
    if (scope === 'current') return r.has_open_admission;
    if (scope === 'former') return !r.has_open_admission;
    return true;
  });

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
    <div className="space-y-6 px-4 py-5 sm:px-5">
      <PageHeader
        eyebrow={centre.name}
        title="Client directory"
        description={
          !loading && query.trim().length === 0
            ? `${results.length} ${results.length === 1 ? 'person has' : 'people have'} stayed at this centre`
            : canSeeNames
              ? 'Search by name or reference. Only clients with an admission at this centre — past or present — appear here.'
              : 'Search by reference. Names are withheld for your role; only clients with an admission at this centre — past or present — appear here.'
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-soft">
        <span className="flex items-center gap-1.5 pl-1 text-xs font-semibold text-muted-foreground">
          <Filter className="size-3.5" /> Filters
        </span>
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Search clients</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={canSeeNames ? 'Search by name, reference or concern' : 'Search by reference…'}
            className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12.5px] transition focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
          aria-label="Filter by residency"
          className="h-9 shrink-0 rounded-lg border border-[var(--color-line)] bg-card px-2.5 text-[12.5px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">Everyone</option>
          <option value="current">Currently resident</option>
          <option value="former">Former clients</option>
        </select>
        {results.length > 0 ? (
          <span className="tabular ml-auto shrink-0 pr-1 text-xs text-muted-foreground">
            {visible.length} results
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-[12.5px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div>
        {query.trim().length === 1 ? (
          <p className="text-[12px] text-muted-foreground">
            Keep typing — a single character is too broad to search.
          </p>
        ) : loading ? (
          <p className="text-[12px] text-muted-foreground">Loading clients…</p>
        ) : results.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {query.trim().length >= 2
              ? `No clients matched at ${centre.name}.`
              : `No clients have stayed at ${centre.name} yet.`}
          </p>
        ) : (
          visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-line)] py-14 text-center">
              <p className="text-[13px] font-medium">No results match this filter</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-card">
              <ul className="divide-y divide-[var(--color-line)]">
                {visible.map((r) => {
                  const label = r.display_name ?? r.reference;
                  return (
                    <li key={r.client_id}>
                      <button
                        type="button"
                        onClick={() => setOpenClient(r)}
                        className="flex min-h-[64px] w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-[var(--color-accent-soft)]"
                      >
                        <ClientAvatar initials={initialsOf(label)} hue={hueOf(r.client_id)} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold">{label}</div>
                          <div className="nums truncate text-[12px] text-muted-foreground">{r.reference}</div>
                        </div>
                        {r.last_admitted_at ? (
                          <div className="hidden shrink-0 text-right text-xs sm:block">
                            <p className="text-muted-foreground">Latest admission</p>
                            <p className="tabular font-medium">{formatDate(new Date(r.last_admitted_at))}</p>
                          </div>
                        ) : null}
                        <div className="shrink-0">
                          {r.has_open_admission ? (
                            <StatusBadge status="ontrack" label="Currently resident" size="sm" />
                          ) : r.last_admission_status ? (
                            <Chip label={STATUS_LABEL[r.last_admission_status] ?? r.last_admission_status} />
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        )}
      </div>

      {openClient ? (
        <ClientFilePanel
          client={openClient}
          centre={centre}
          onClose={() => setOpenClient(null)}
          onOpenBed={
            onOpenBed
              ? (bedLabel) => {
                  setOpenClient(null);
                  onOpenBed(bedLabel);
                }
              : undefined
          }
        />
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
