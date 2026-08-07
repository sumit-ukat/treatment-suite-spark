import { cn } from '@/lib/utils';
import markUrl from '../assets/brand/ukat-mark.png';

/**
 * The real UKAT mark, not the placeholder heart-pulse glyph the Lovable source draws here — that
 * source had no access to the actual brand asset and invented one. The gradient tile, radius and
 * shadow around it are ported as-is; only what's inside changed.
 */
export function BrandMark({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        'brand-gradient grid size-9 shrink-0 place-items-center rounded-xl shadow-soft',
        className,
      )}
      aria-hidden
    >
      <img src={markUrl} alt="" width={256} height={256} className="size-5 object-contain" />
    </span>
  );
}

/**
 * `bg-[var(--accent)]` rather than `bg-accent`: `--color-accent` is one of the two tokens the ported
 * design foundation deliberately held back (see styles.css) because this codebase's existing accent
 * colour already owns that name. Reads the same either way — just via the raw variable instead of a
 * generated utility class.
 */
const tones = ['bg-primary-soft text-primary', 'bg-[var(--accent)] text-accent-foreground', 'bg-brand-blue/30 text-brand-blue-foreground'];

/**
 * A client's avatar is initials on a tone, never a photograph — no real client photo appears in any
 * preview, fixture or screenshot in this codebase, and this component doesn't change that.
 *
 * `hue` picks which of the three tones to use; callers should derive it deterministically from a
 * stable real field (e.g. the client's reference), not store it as data of its own — it exists only
 * to keep a grid of avatars visually distinct, not to record anything.
 */
export function ClientAvatar({
  initials,
  hue,
  size = 'md',
  className,
}: {
  initials: string;
  hue: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string | undefined;
}) {
  const tone = tones[((hue % tones.length) + tones.length) % tones.length];
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-display font-semibold',
        size === 'sm' && 'size-8 text-xs',
        size === 'md' && 'size-11 text-sm',
        size === 'lg' && 'size-16 text-xl',
        tone,
        className,
      )}
    >
      {initials}
    </span>
  );
}
