import { useCallback, useEffect, useRef, useState } from 'react';
import { buildRealBoard } from './real-board-data.js';
import type { BoardBed } from './board-data.js';

export interface BoardDataState {
  beds: readonly BoardBed[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  loadedAt: Date | null;
  refresh: () => void;
}

/**
 * Single source of board data for both the Treatment Board and Room Board.
 *
 * Both views render from the same `buildRealBoard` call and the same
 * Supabase tables — there is no separate fetch or local cache per view.
 * Call `refresh()` after any mutation (task completion, discharge, extend
 * stay, etc.) to trigger a silent re-fetch without blanking the UI.
 */
export function useBoardData(centreId: string | null | undefined): BoardDataState {
  const [beds, setBeds] = useState<readonly BoardBed[]>([]);
  const [loading, setLoading] = useState(!!centreId);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [version, setVersion] = useState(0);
  const hasDataRef = useRef(false);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!centreId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (hasDataRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    buildRealBoard(centreId)
      .then(({ board }) => {
        if (!cancelled) {
          setBeds(board);
          hasDataRef.current = true;
          setError(null);
          setLoadedAt(new Date());
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      });
    return () => { cancelled = true; };
  }, [centreId, version]);

  return { beds, loading, refreshing, error, loadedAt, refresh };
}
