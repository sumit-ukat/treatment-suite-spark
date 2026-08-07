import { cn } from '@/lib/utils';

export function OccupancyBar({
  value,
  capacity,
  className,
  showLabel = true,
}: {
  value: number;
  capacity: number;
  className?: string | undefined;
  showLabel?: boolean;
}) {
  const pct = capacity ? Math.round((value / capacity) * 100) : 0;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${value} of ${capacity} beds occupied, ${pct} percent`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="tabular w-20 shrink-0 text-right text-xs font-semibold text-muted-foreground">
          {value}/{capacity} · {pct}%
        </span>
      )}
    </div>
  );
}

export function ProgressBar({
  done,
  total,
  tone = 'primary',
  className,
}: {
  done: number;
  total: number;
  tone?: 'primary' | 'overdue';
  className?: string | undefined;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
        <span>Required actions</span>
        <span className="tabular">
          {done}/{total} done
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', tone === 'overdue' ? 'bg-overdue' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
