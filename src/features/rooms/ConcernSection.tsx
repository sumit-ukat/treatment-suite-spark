import { useEffect, useState } from 'react';
import {
  concerns as concernsService,
  type ConcernCategory,
  type ConcernRow,
} from '../../services/data-access.js';
import { formatDate } from '../../lib/format.js';

const CATEGORY_LABELS: Record<ConcernCategory, string> = {
  behaviour: 'Behaviour',
  risk:      'Risk',
  medical:   'Medical',
  welfare:   'Welfare',
  general:   'General',
};

/**
 * Shared concern log panel used inside both DetailPanel (room board) and
 * TreatmentDetailPanel. Requires a real admissionId — renders nothing when
 * the board is fictional (admissionId === null).
 */
export function ConcernSection({
  clientId,
  admissionId,
  centreId,
  compact = false,
}: {
  clientId: string;
  admissionId: string;
  centreId: string;
  /** Compact mode trims padding for use inside the treatment detail panel header. */
  compact?: boolean;
}) {
  const [list, setList] = useState<ConcernRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<ConcernCategory>('general');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setList(null);
    concernsService
      .list(centreId, clientId)
      .then((d) => { if (!cancelled) setList(d); })
      .catch(() => { if (!cancelled) setList([]); });
    return () => { cancelled = true; };
  }, [clientId, centreId]);

  async function submit() {
    if (!note.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await concernsService.log(clientId, admissionId, centreId, note, category);
      setNote('');
      setCategory('general');
      setShowForm(false);
      const updated = await concernsService.list(centreId, clientId);
      setList(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save concern.');
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string) {
    try {
      await concernsService.resolve(id);
      setList((prev) => prev ? prev.map((c) => c.id === id ? { ...c, is_resolved: true } : c) : prev);
    } catch { /* non-critical */ }
  }

  const open = list?.filter((c) => !c.is_resolved) ?? [];

  return (
    <div className={compact ? 'pt-2' : ''}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
            Concerns
          </span>
          {open.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              {open.length} open
            </span>
          ) : null}
        </div>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
          >
            ⚑ Log concern
          </button>
        ) : null}
      </div>

      {/* Log form */}
      {showForm ? (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800/50 dark:bg-amber-950/20">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ConcernCategory)}
            className="mb-2 h-8 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[12px] focus:border-[var(--color-accent)] focus:outline-none"
          >
            {(Object.entries(CATEGORY_LABELS) as [ConcernCategory, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <textarea
            autoFocus
            rows={3}
            placeholder="Describe the concern…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
          />
          {err ? <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{err}</p> : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || !note.trim()}
              onClick={() => void submit()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11.5px] font-semibold text-white transition disabled:opacity-40 hover:bg-amber-700"
            >
              {busy ? 'Saving…' : 'Save concern'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setShowForm(false); setNote(''); setErr(null); }}
              className="rounded-lg px-2.5 py-1.5 text-[11.5px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Concern list */}
      {list === null ? (
        <p className="mt-1 text-[11.5px] text-[var(--color-ink-muted)]">Loading…</p>
      ) : list.length === 0 && !showForm ? (
        <p className="mt-1 text-[11.5px] text-[var(--color-ink-muted)]">No concerns logged.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {list.map((c) => (
            <li
              key={c.id}
              className={`rounded-lg border p-2.5 text-[12px] ${
                c.is_resolved
                  ? 'border-[var(--color-line)] bg-[var(--color-surface)] opacity-60'
                  : 'border-amber-200 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-950/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      {CATEGORY_LABELS[c.category as ConcernCategory] ?? c.category}
                    </span>
                    {c.is_resolved ? (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">Resolved</span>
                    ) : null}
                  </div>
                  <p className="mt-1 leading-snug">{c.note}</p>
                  <p className="mt-0.5 text-[10.5px] text-[var(--color-ink-muted)]">
                    {c.logged_by_name} · {formatDate(new Date(c.logged_at))}
                  </p>
                </div>
                {!c.is_resolved ? (
                  <button
                    type="button"
                    onClick={() => void resolve(c.id)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Resolve
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
