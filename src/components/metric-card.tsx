import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function MetricCard({
  label,
  value,
  suffix,
  hint,
  icon,
  accent = 'default',
}: {
  label: string;
  value: string | number;
  suffix?: string | undefined;
  hint?: string | undefined;
  icon?: ReactNode | undefined;
  accent?: 'default' | 'primary' | 'pink' | 'blue';
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card p-5 shadow-soft',
        accent === 'primary' && 'border-primary/25',
        accent === 'pink' && 'border-brand-pink/30',
        accent === 'blue' && 'border-brand-blue/40',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          accent === 'primary' && 'bg-primary',
          accent === 'pink' && 'bg-brand-pink',
          accent === 'blue' && 'bg-brand-blue',
          accent === 'default' && 'bg-border',
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="tabular mt-3 font-display text-3xl font-semibold text-foreground">
        {value}
        {suffix && <span className="ml-0.5 text-lg text-muted-foreground">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  eyebrow?: string | undefined;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">{eyebrow}</p>
        )}
        <h1 className="mt-1 truncate font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
