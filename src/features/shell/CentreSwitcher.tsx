import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CentreSummary } from '../centres/centres-data.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.tsx';

/**
 * Shared between the topbar (its own pill-button trigger) and the sidebar's centre-box card (which
 * supplies `trigger` to reuse this exact same list/switch logic under its own visual treatment,
 * rather than duplicating the dropdown).
 */
export function CentreSwitcher({
  centres,
  value,
  onChange,
  trigger,
}: {
  centres: readonly CentreSummary[];
  value: string;
  onChange: (slug: string) => void;
  /** Custom trigger — omitted, falls back to the topbar's own pill-button trigger. */
  trigger?: ((current: CentreSummary | undefined) => ReactNode) | undefined;
}) {
  const current = centres.find((c) => c.slug === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ? (
          trigger(current)
        ) : (
          <button
            type="button"
            className="hidden items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent-ring)] sm:flex"
          >
            <span className="max-w-[160px] truncate">{current?.name ?? 'Select centre'}</span>
            <ChevronDown className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-auto">
        <DropdownMenuLabel>Switch centre</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {centres.map((c) => (
          <DropdownMenuItem key={c.slug} onSelect={() => onChange(c.slug)}>
            <span className="min-w-0 flex-1 truncate">
              {c.name}
              {c.isConfigured ? '' : ' — no data'}
            </span>
            <span className="text-muted-foreground ml-auto shrink-0 text-xs">{c.region}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
