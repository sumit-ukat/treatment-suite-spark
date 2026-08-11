import { useEffect, useState } from 'react';
import { Moon, Sun, Sunset } from 'lucide-react';
import { PRIMROSE_LODGE_SETTINGS } from '../domain/centre-settings.js';
import { toWallClock } from '../domain/zoned-time.js';

/**
 * The current time, in the centre's timezone.
 *
 * **Not the browser's timezone**, deliberately. Every due date, overdue check and treatment-day count
 * in this application is computed in the centre's zone — a task is late when it is late *there*. A
 * manager working from another timezone reading a browser-local clock beside those figures would be
 * comparing two different "now"s, and the header has always carried an explicit `Europe/London` label
 * for exactly that reason. The zone stays on screen so the reading is never ambiguous.
 *
 * No mount guard or placeholder: this is a Vite SPA with no server rendering, so the first render
 * already happens in the browser with the real time. There is no hydration to mismatch.
 */

// TODO: read from `centres.timezone` once a centre outside Europe/London exists — the same scoped
// simplification made in real-board-data.ts and the room board.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

/**
 * Conventional times of day, not this organisation's rota.
 *
 * Real shift windows are not recorded anywhere in the schema — there is no shift table and no
 * handover time configured per centre. These are the ordinary meanings of the words, which is honest;
 * naming them "Early"/"Late"/"Night" would imply they matched a rota this system has never been told
 * about, and a handover boundary shown an hour off is worse than none at all.
 */
function timeOfDay(hour: number): { label: string; Icon: typeof Sun } {
  if (hour < 6) return { label: 'Night', Icon: Moon };
  if (hour < 12) return { label: 'Morning', Icon: Sun };
  if (hour < 18) return { label: 'Afternoon', Icon: Sun };
  if (hour < 22) return { label: 'Evening', Icon: Sunset };
  return { label: 'Night', Icon: Moon };
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function LiveClock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Aligned to the next second boundary rather than a flat 1000ms interval, which drifts and makes
    // the display occasionally skip or repeat a second.
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(tick, 1000 - (current.getTime() % 1000));
    };
    timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(timer);
  }, []);

  const { hour } = toWallClock(now, TZ);
  const { label, Icon } = timeOfDay(hour);

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 ${className}`}
      title={`Centre time · ${TZ}`}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" />
      <div className="leading-tight">
        {/* `nums` is this codebase's tabular-numeral utility — without it every digit change shifts
            the pill's width, which is very visible on a clock ticking once a second. */}
        <div className="nums font-display text-[15px] font-semibold">{timeFormatter.format(now)}</div>
        <div className="nums hidden text-[10.5px] text-[var(--color-ink-muted)] sm:block">
          {dateFormatter.format(now)} &middot; {label}
        </div>
      </div>
    </div>
  );
}
