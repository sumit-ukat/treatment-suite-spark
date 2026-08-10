import { useEffect, useState } from 'react';
import { clients as clientsService, type ClientSearchResult } from '../../services/data-access.js';

/**
 * Shared by the standalone Clients directory and the admission form's "use an existing client"
 * picker — one search behaviour, not two copies that drift.
 *
 * An empty query lists everyone at the centre; `app.search_clients` (see migration 0032) refuses only
 * a single character, since that's still too broad an ILIKE to be useful — so a one-character query is
 * not sent at all rather than sent and discarded, the same reasoning migration 0028 originally applied
 * to the old two-character minimum.
 */
export function useClientSearch(centreId: string) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 1) {
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
