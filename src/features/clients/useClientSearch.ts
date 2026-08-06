import { useEffect, useState } from 'react';
import { clients as clientsService, type ClientSearchResult } from '../../services/data-access.js';

/**
 * Shared by the standalone Clients directory and the admission form's "use an existing client"
 * picker — one search behaviour, not two copies that drift.
 *
 * The 2-character minimum and the debounce both exist for the same reason: `app.search_clients`
 * refuses anything under 2 characters itself (see migration 0028), so a query below that is not sent
 * at all rather than sent and discarded — one fewer round trip for the case that happens on every
 * first keystroke.
 */
export function useClientSearch(centreId: string) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      clientsService
        .search(centreId, q)
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [centreId, query]);

  return { query, setQuery, results, loading, error };
}
