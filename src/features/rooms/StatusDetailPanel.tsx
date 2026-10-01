import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { BoardBed } from './board-data.js';
import { PhotoBadge } from './BedCard.tsx';
import { admissions } from '../../services/data-access.js';
import { CARE_STATUS_LABEL, type CareStatus } from './category-status.js';

const OPTIONS: readonly CareStatus[] = ['graduate', 'discharged', 'extended', 'transferred'];

const DOT_TONE: Record<CareStatus, string> = {
  graduate: 'bg-emerald-500',
  discharged: 'bg-black/30 dark:bg-white/40',
  extended: 'bg-amber-500',
  transferred: 'bg-[var(--color-accent)]',
};

/**
 * Quick Status picker — same slide-in side-panel shell as CategoryDetailPanel, but for a single
 * field rather than a task category: pick an option and it's applied immediately, no separate save
 * step. Uses `admissions.setCareStatus` (migration 0071), not the big `updateDetails` form, so
 * picking a Status here can never touch any other admission field.
 */
export function StatusDetailPanel({
  bed,
  onClose,
  onChanged,
  readOnly = false,
}: {
  bed: BoardBed;
  onClose: () => void;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
}) {
  const o = bed.occupant;
  const [busy, setBusy] = useState<CareStatus | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!o) return null;

  async function choose(next: CareStatus | null) {
    if (!o?.admissionId || readOnly) return;
    setBusy(next ?? 'clear');
    setError(null);
    try {
      await admissions.setCareStatus(o.admissionId, next);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(null);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" aria-hidden onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${o.displayName} — Status`}
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-[420px] flex-col bg-card shadow-2xl"
        style={{ animation: 'sdp-slide-in 0.22s cubic-bezier(0.25,0.46,0.45,0.94) both' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--color-line)] px-6 pt-7 pb-5 shrink-0">
          <PhotoBadge occupant={o} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[20px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
              {o.displayName}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">Room {bed.label} · Status</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-1 shrink-0 rounded-[6px] p-1.5 text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Options */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="mb-3 text-[11px] text-[var(--color-ink-muted)]">
            Set independently of the discharge workflow — pick one to apply it straight away.
          </p>
          <div className="flex flex-col gap-2">
            <OptionRow
              label="Not set"
              dotClassName="bg-black/15 dark:bg-white/20"
              selected={o.careStatus === null}
              busy={busy === 'clear'}
              disabled={readOnly || busy !== null}
              onClick={() => void choose(null)}
            />
            {OPTIONS.map((key) => (
              <OptionRow
                key={key}
                label={CARE_STATUS_LABEL[key]}
                dotClassName={DOT_TONE[key]}
                selected={o.careStatus === key}
                busy={busy === key}
                disabled={readOnly || busy !== null}
                onClick={() => void choose(key)}
              />
            ))}
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-[11.5px] text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes sdp-slide-in {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="sdp-slide-in"] { animation: none !important; }
        }
      `}</style>
    </>,
    document.body,
  );
}

function OptionRow({
  label,
  dotClassName,
  selected,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  dotClassName: string;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-default disabled:opacity-60 ${
        selected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
          : 'border-[var(--color-line)] hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
      }`}
    >
      <span className={`size-2.5 shrink-0 rounded-full ${dotClassName}`} aria-hidden />
      <span className="flex-1 text-[13px] font-medium text-[var(--color-ink)]">{label}</span>
      {busy ? (
        <span className="text-[11px] text-[var(--color-ink-muted)]">Saving…</span>
      ) : selected ? (
        <Check className="size-4 shrink-0 text-[var(--color-accent)]" />
      ) : null}
    </button>
  );
}
