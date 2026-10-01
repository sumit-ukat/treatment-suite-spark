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
 * A client's avatar: their real photo when one exists and the caller has it to show (a signed URL —
 * see `clients.search`/migration-era `roomBoard.photos` for why it's never a bare storage path),
 * initials on a tone otherwise. Initials-only used to be the only option this component offered at
 * all; the Client Directory and client file panel are where a real photo was explicitly asked for.
 *
 * `hue` picks which of the three tones to use; callers should derive it deterministically from a
 * stable real field (e.g. the client's reference), not store it as data of its own — it exists only
 * to keep a grid of avatars visually distinct, not to record anything.
 */
export function ClientAvatar({
  initials,
  hue,
  photoUrl,
  size = 'md',
  className,
}: {
  initials: string;
  hue: number;
  photoUrl?: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string | undefined;
}) {
  const tone = tones[((hue % tones.length) + tones.length) % tones.length];
  const sizeCls =
    size === 'sm' ? 'size-8 text-xs' : size === 'md' ? 'size-11 text-sm' : 'size-16 text-xl';

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        className={cn('shrink-0 rounded-full object-cover', sizeCls, className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-display font-semibold',
        sizeCls,
        tone,
        className,
      )}
    >
      {initials}
    </span>
  );
}
