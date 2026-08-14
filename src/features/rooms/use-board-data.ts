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
 *
 * Pass `asOf` to request a historical snapshot: the board will show who
 * was in each bed at that moment, with task states as they stood then.
 * Switching between live and a snapshot always does a full reload.
 */
export function useBoardData(
  centreId: string | null | undefined,
  asOf?: Date | null,
): BoardDataState {
  const [beds, setBeds] = useState<readonly BoardBed[]>([]);
  const [loading, setLoading] = useState(!!centreId);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [version, setVersion] = useState(0);
  const hasDataRef = useRef(false);

  // Serialise to a string so the effect dep stays stable across renders.
  const asOfStr = asOf?.toISOString() ?? null;

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!centreId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Switching between live and a snapshot resets the board completely rather than
    // showing a stale board as "refreshing" — the data source has fundamentally changed.
    if (hasDataRef.current && !asOfStr) {
      setRefreshing(true);
    } else {
      hasDataRef.current = false;
      setLoading(true);
    }
    const now = asOfStr ? new Date(asOfStr) : new Date();
    buildRealBoard(centreId, now)
      .then(({ board }) => {
        if (!cancelled) {
          setBeds(board);
          hasDataRef.current = !asOfStr; // only cache live board state
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
  }, [centreId, version, asOfStr]);

  return { beds, loading, refreshing, error, loadedAt, refresh };
}
