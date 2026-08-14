import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1999 }, (_, i) => CURRENT_YEAR - i);

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Custom week-based archive date picker with a two-step flow:
 * 1. Navigate to a week and click a day to select it (pending — no data fetch yet).
 * 2. Press "View this date" to confirm and trigger the board snapshot load.
 *
 * Month/year selects jump to any period from 2000; ← → arrows step one week at a time.
 */
export function ArchivePicker({
  value,
  onChange,
}: {
  /** YYYY-MM-DD of the currently applied archive date, or '' for live. */
  value: string;
  onChange: (date: string) => void;
}) {
  const today = isoDate(new Date());

  // The week being displayed in the picker (Monday of that week).
  const [anchor, setAnchor] = useState<Date>(() =>
    value ? getWeekMonday(new Date(value + 'T12:00:00')) : getWeekMonday(new Date()),
  );

  // A date the user has clicked but not yet confirmed — '' means nothing pending.
  const [pending, setPending] = useState('');

  // When the applied value changes externally (e.g. cleared via the archive banner),
  // sync the anchor and clear pending.
  useEffect(() => {
    setPending('');
    if (value) setAnchor(getWeekMonday(new Date(value + 'T12:00:00')));
  }, [value]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    return d;
  });

  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();

  function stepWeek(dir: -1 | 1) {
    setAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + dir * 7);
      if (next < new Date('2000-01-01T12:00:00')) return prev;
      if (next > new Date()) return prev;
      return next;
    });
  }

  function jumpToMonth(month: number) {
    const next = new Date(anchor);
    next.setMonth(month);
    if (next.getFullYear() < 2000) { next.setFullYear(2000); next.setMonth(0); }
    if (next > new Date()) return;
    setAnchor(getWeekMonday(next));
  }

  function jumpToYear(year: number) {
    const next = new Date(anchor);
    next.setFullYear(year);
    if (next.getFullYear() < 2000) return;
    if (next > new Date()) {
      const dec = new Date(year, 11, 31, 12, 0, 0);
      setAnchor(getWeekMonday(dec > new Date() ? new Date() : dec));
      return;
    }
    setAnchor(getWeekMonday(next));
  }

  function confirm() {
    if (pending) onChange(pending);
  }

  const canGoBack = isoDate(anchor) > '2000-01-01';
  const canGoForward = isoDate(new Date(anchor.getTime() + 7 * 86400_000)) <= today;

  // Label for the confirm button.
  const pendingLabel = pending
    ? new Date(pending + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      })
    : null;

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-card p-4">
      {/* ── Controls row ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Month select */}
        <select
          value={anchorMonth}
          onChange={(e) => jumpToMonth(Number(e.target.value))}
          className="h-8 rounded-lg border border-[var(--color-line)] bg-transparent px-2 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>

        {/* Year select */}
        <select
          value={anchorYear}
          onChange={(e) => jumpToYear(Number(e.target.value))}
          className="h-8 rounded-lg border border-[var(--color-line)] bg-transparent px-2 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* Week arrows */}
        <button
          type="button"
          title="Previous week"
          disabled={!canGoBack}
          onClick={() => stepWeek(-1)}
          className="rounded-lg border border-[var(--color-line)] p-1.5 text-[var(--color-ink-muted)] transition hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          title="Next week"
          disabled={!canGoForward}
          onClick={() => stepWeek(1)}
          className="rounded-lg border border-[var(--color-line)] p-1.5 text-[var(--color-ink-muted)] transition hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
        >
          <ChevronRight className="size-4" />
        </button>

        {/* Back to live — only shown when a date is already applied */}
        {value ? (
          <button
            type="button"
            onClick={() => { setPending(''); onChange(''); }}
            className="ml-auto flex items-center gap-1 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-ink-muted)] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="size-3.5" /> Back to live
          </button>
        ) : null}
      </div>

      {/* ── Day cells ── */}
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {days.map((day, i) => {
          const iso = isoDate(day);
          const isFuture = iso > today;
          const isApplied = iso === value;   // currently loaded in the board
          const isPending = iso === pending; // selected but not yet confirmed
          const isToday   = iso === today;

          let cellCls: string;
          if (isPending) {
            cellCls = 'ring-2 ring-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
          } else if (isApplied) {
            cellCls = 'bg-amber-500 text-white shadow-sm';
          } else if (isFuture) {
            cellCls = 'cursor-not-allowed opacity-25';
          } else if (isToday) {
            cellCls = 'border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]';
          } else {
            cellCls = 'hover:bg-black/5 dark:hover:bg-white/8';
          }

          return (
            <button
              key={iso}
              type="button"
              disabled={isFuture}
              onClick={() => setPending(iso === pending ? '' : iso)}
              className={`flex flex-col items-center rounded-xl py-2.5 text-center transition ${cellCls}`}
            >
              <span className={`text-[9.5px] font-semibold tracking-wide uppercase ${
                isPending || isApplied ? 'opacity-70' : 'text-[var(--color-ink-muted)]'
              }`}>
                {DAY_LABELS[i]}
              </span>
              <span className="mt-0.5 text-[15px] font-bold leading-none">
                {day.getDate()}
              </span>
              <span className={`mt-0.5 text-[9px] ${
                isPending || isApplied ? 'opacity-70' : 'text-[var(--color-ink-muted)]'
              }`}>
                {MONTHS[day.getMonth()]!.slice(0, 3)}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Confirm / status row ── */}
      <div className="mt-3 flex items-center gap-3 border-t border-[var(--color-line)] pt-3">
        {pending ? (
          <>
            <p className="min-w-0 flex-1 text-[11.5px] text-[var(--color-ink-muted)]">
              Selected:{' '}
              <span className="font-semibold text-[var(--color-ink)]">{pendingLabel}</span>
            </p>
            <button
              type="button"
              onClick={confirm}
              className="shrink-0 rounded-lg bg-amber-500 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-amber-600"
            >
              View this date
            </button>
          </>
        ) : value ? (
          <p className="text-[11.5px] text-[var(--color-ink-muted)]">
            Viewing snapshot for{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              {new Date(value + 'T12:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
            {' — click a day above to change, or use "Back to live".'}
          </p>
        ) : (
          <p className="text-[11.5px] text-[var(--color-ink-muted)]">
            Click any day to select it, then press <span className="font-medium text-[var(--color-ink)]">View this date</span> to load the board snapshot.
          </p>
        )}
      </div>
    </div>
  );
}
