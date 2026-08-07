import { Check, Circle, Minus, Square, Triangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Five presentational states, deliberately generic rather than tied to any one domain concept (a
 * task, a discharge stage, a centre) — this codebase already has real types for each of those; this
 * is just the shared vocabulary for how a status *reads*, ported from the Lovable source's own
 * `data/types.ts` (the only piece of that file this codebase needs, since the rest of it is demo data
 * standing in for tables this app already has for real).
 */
export type StatusKey = 'ontrack' | 'attention' | 'overdue' | 'complete' | 'neutral';

const config: Record<
  StatusKey,
  { label: string; Icon: typeof Circle; className: string; dot: string }
> = {
  ontrack: {
    label: 'On track',
    Icon: Circle,
    className: 'bg-ontrack-soft text-ontrack border-ontrack/40',
    dot: 'text-ontrack',
  },
  attention: {
    label: 'Needs attention',
    Icon: Triangle,
    className: 'bg-attention-soft text-attention border-attention/50 border-dashed',
    dot: 'text-attention',
  },
  overdue: {
    label: 'Overdue',
    Icon: Square,
    className: 'bg-overdue-soft text-overdue border-overdue/60 border-2',
    dot: 'text-overdue',
  },
  complete: {
    label: 'Complete',
    Icon: Check,
    className: 'bg-neutral-status-soft text-neutral-status border-neutral-status/30',
    dot: 'text-neutral-status',
  },
  neutral: {
    label: 'Available',
    Icon: Minus,
    className: 'bg-neutral-status-soft text-neutral-status border-neutral-status/30',
    dot: 'text-neutral-status',
  },
};

export function statusLabel(status: StatusKey) {
  return config[status].label;
}

export function StatusIcon({ status, className }: { status: StatusKey; className?: string | undefined }) {
  const { Icon, dot } = config[status];
  return <Icon aria-hidden className={cn('size-3 shrink-0 fill-current', dot, className)} />;
}

export function StatusBadge({
  status,
  label,
  className,
  size = 'md',
}: {
  status: StatusKey;
  label?: string | undefined;
  className?: string | undefined;
  size?: 'sm' | 'md' | undefined;
}) {
  const c = config[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        c.className,
        className,
      )}
    >
      <c.Icon aria-hidden className="size-3 shrink-0 fill-current" />
      {label ?? c.label}
    </span>
  );
}
