import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface DateRange {
  start: string; // YYYY-MM-DD or ''
  end: string;   // YYYY-MM-DD or ''
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Month grid ───────────────────────────────────────────────────────────────

function MonthGrid({
  year, month,
  pendingStart, pendingEnd,
  today,
  onDayClick,
}: {
  year: number;
  month: number;
  pendingStart: string;
  pendingEnd: string;
  today: string;
  onDayClick: (iso: string) => void;
}) {
  // Mon-first weekday offset (Mon=0 … Sun=6)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const hasRange = !!(pendingStart && pendingEnd);

  return (
    <div className="min-w-0 flex-1">
      {/* Month label */}
      <p className="mb-3 text-center text-[13px] font-semibold text-[var(--color-ink)]">
        {MONTHS[month]} {year}
      </p>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7">
        {DAY_LABELS.map((d) => (
          <div key={d} className="pb-1.5 text-center text-[9.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            {d}
          </div>
        ))}

        {/* Day cells */}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;

          const m = String(month + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const iso = `${year}-${m}-${dd}`;
          const isFuture = iso > today;
          const isStart  = iso === pendingStart;
          const isEnd    = iso === pendingEnd;
          const inRange  = hasRange && iso > pendingStart && iso < pendingEnd;
          const isToday  = iso === today;

          if (isFuture) {
            return (
              <div key={i} className="py-0.5 text-center">
                <span className="inline-flex size-8 items-center justify-center text-[12.5px] text-[var(--color-ink-muted)] opacity-25 select-none">
                  {day}
                </span>
              </div>
            );
          }

          // Each cell is a relative container so we can paint the range bg behind the circle.
          return (
            <div
              key={i}
              className="relative cursor-pointer py-0.5"
              onClick={() => onDayClick(iso)}
            >
              {/* Range background — spans full cell for in-range, half for start/end */}
              {inRange && (
                <span className="absolute inset-0 bg-amber-100 dark:bg-amber-900/30" />
              )}
              {isStart && hasRange && pendingStart !== pendingEnd && (
                <span className="absolute inset-y-0 left-1/2 right-0 bg-amber-100 dark:bg-amber-900/30" />
              )}
              {isEnd && hasRange && pendingStart !== pendingEnd && (
                <span className="absolute inset-y-0 left-0 right-1/2 bg-amber-100 dark:bg-amber-900/30" />
              )}

              {/* Circle */}
              <span
                className={`relative z-10 mx-auto flex size-8 items-center justify-center rounded-full text-[12.5px] font-medium transition select-none ${
                  isStart || isEnd
                    ? 'bg-amber-500 font-bold text-white'
                    : inRange
                    ? 'text-amber-900 dark:text-amber-100'
                    : isToday
                    ? 'ring-2 ring-[var(--color-accent)] text-[var(--color-accent)] font-semibold'
                    : 'text-[var(--color-ink)] hover:bg-black/8 dark:hover:bg-white/8'
                }`}
              >
                {day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

/**
 * Two-calendar date range picker for the archive feature.
 *
 * Flow:
 *  1. Click a start date (highlights in amber).
 *  2. Click an end date (range highlighted between them).
 *  3. Press "View this period" → calls onConfirm with the chosen range.
 *
 * The left calendar shows one month, the right the next. Navigation arrows
 * shift both calendars together. Years from 2000 are selectable; future
 * dates are disabled.
 */
export function ArchivePicker({
  value,
  onConfirm,
  onClear,
}: {
  value: DateRange;
  onConfirm: (range: DateRange) => void;
  onClear: () => void;
}) {
  const today = isoDate(new Date());
  const now   = new Date();

  // Left calendar anchor (right = left + 1 month).
  const [leftYear,  setLeftYear]  = useState<number>(() => {
    if (value.start) return new Date(value.start + 'T12:00:00').getFullYear();
    return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  });
  const [leftMonth, setLeftMonth] = useState<number>(() => {
    if (value.start) return new Date(value.start + 'T12:00:00').getMonth();
    return now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  });

  const rightYear  = leftMonth === 11 ? leftYear + 1 : leftYear;
  const rightMonth = (leftMonth + 1) % 12;

  // Pending selection (not yet confirmed)
  const [pendingStart, setPendingStart] = useState(value.start);
  const [pendingEnd,   setPendingEnd]   = useState(value.end);

  // Sync when applied value is cleared externally
  useEffect(() => {
    setPendingStart(value.start);
    setPendingEnd(value.end);
  }, [value.start, value.end]);

  function handleDayClick(iso: string) {
    if (!pendingStart || (pendingStart && pendingEnd)) {
      // No start yet, or resetting: start fresh
      setPendingStart(iso);
      setPendingEnd('');
    } else if (iso === pendingStart) {
      // Clicked the same start day: deselect
      setPendingStart('');
      setPendingEnd('');
    } else if (iso < pendingStart) {
      // Clicked before current start: new start
      setPendingStart(iso);
      setPendingEnd('');
    } else {
      // Valid end date
      setPendingEnd(iso);
    }
  }

  function prevMonth() {
    if (leftYear === 2000 && leftMonth === 0) return;
    if (leftMonth === 0) { setLeftYear((y) => y - 1); setLeftMonth(11); }
    else setLeftMonth((m) => m - 1);
  }

  function nextMonth() {
    // After advancing, new right calendar = new left + 1. Stop if that would be future.
    const nly = leftMonth === 11 ? leftYear + 1 : leftYear;
    const nlm = (leftMonth + 1) % 12;
    const nry = nlm === 11 ? nly + 1 : nly;
    const nrm = (nlm + 1) % 12;
    if (nry > now.getFullYear()) return;
    if (nry === now.getFullYear() && nrm > now.getMonth()) return;
    setLeftYear(nly);
    setLeftMonth(nlm);
  }

  const canGoPrev = !(leftYear === 2000 && leftMonth === 0);
  const canGoNext = (() => {
    const nly = leftMonth === 11 ? leftYear + 1 : leftYear;
    const nlm = (leftMonth + 1) % 12;
    const nry = nlm === 11 ? nly + 1 : nly;
    const nrm = (nlm + 1) % 12;
    if (nry > now.getFullYear()) return false;
    if (nry === now.getFullYear() && nrm > now.getMonth()) return false;
    return true;
  })();

  const canConfirm = !!(pendingStart && pendingEnd);
  const hasApplied = !!(value.start && value.end);

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-card p-5">

      {/* ── Navigation bar ── */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={prevMonth}
          title="Previous month"
          className="rounded-lg border border-[var(--color-line)] p-1.5 text-[var(--color-ink-muted)] transition hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex flex-1 items-center justify-center gap-2">
          {hasApplied ? (
            <span className="text-[11.5px] text-amber-700 dark:text-amber-400">
              Viewing{' '}
              <span className="font-semibold">
                {fmtShort(value.start)} → {fmtShort(value.end)}
              </span>
            </span>
          ) : (
            <span className="text-[11.5px] text-[var(--color-ink-muted)]">
              Select a start and end date
            </span>
          )}
        </div>

        {hasApplied ? (
          <button
            type="button"
            onClick={() => { setPendingStart(''); setPendingEnd(''); onClear(); }}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="size-3.5" /> Back to live
          </button>
        ) : null}

        <button
          type="button"
          disabled={!canGoNext}
          onClick={nextMonth}
          title="Next month"
          className="rounded-lg border border-[var(--color-line)] p-1.5 text-[var(--color-ink-muted)] transition hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* ── Two month grids ── */}
      <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
        <MonthGrid
          year={leftYear}
          month={leftMonth}
          pendingStart={pendingStart}
          pendingEnd={pendingEnd}
          today={today}
          onDayClick={handleDayClick}
        />
        <div className="hidden sm:block w-px shrink-0 bg-[var(--color-line)]" />
        <MonthGrid
          year={rightYear}
          month={rightMonth}
          pendingStart={pendingStart}
          pendingEnd={pendingEnd}
          today={today}
          onDayClick={handleDayClick}
        />
      </div>

      {/* ── Status / confirm row ── */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-line)] pt-4">
        {canConfirm ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Start
                </span>
                <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">
                  {fmtShort(pendingStart)}
                </span>
              </div>
              <span className="text-[var(--color-ink-muted)]">→</span>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  End
                </span>
                <span className="text-[12.5px] font-semibold text-[var(--color-ink)]">
                  {fmtShort(pendingEnd)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onConfirm({ start: pendingStart, end: pendingEnd })}
              className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-amber-600"
            >
              View this period
            </button>
          </>
        ) : pendingStart ? (
          <p className="text-[11.5px] text-[var(--color-ink-muted)]">
            <span className="font-semibold text-[var(--color-ink)]">{fmtShort(pendingStart)}</span>
            {' selected — now click an end date'}
          </p>
        ) : (
          <p className="text-[11.5px] text-[var(--color-ink-muted)]">
            Click a <span className="font-medium text-[var(--color-ink)]">start date</span>, then
            an <span className="font-medium text-[var(--color-ink)]">end date</span>, then press{' '}
            <span className="font-medium text-[var(--color-ink)]">View this period</span>.
          </p>
        )}
      </div>
    </div>
  );
}
