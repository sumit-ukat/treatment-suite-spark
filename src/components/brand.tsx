import { cn } from '@/lib/utils';

/** Text-based "ukat." wordmark — transparent background, works on any surface. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('wordmark', className)} aria-label="UKAT">
      uk<span className="wordmark-a">a</span>t
      <span className="wordmark-dot" aria-hidden="true" />
    </span>
  );
}

/**
 * The UKAT mark — two interlocking hands forming a heart, in the brand's pink/blue/purple palette.
 * Inline SVG so it renders transparently on any background (no PNG white-square artefact).
 */
function UkatMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 215"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        {/* Used to mask the purple overlap to only where the two palm ellipses intersect */}
        <clipPath id="ukat-pink-clip">
          <ellipse cx="82" cy="122" rx="68" ry="92" transform="rotate(-22 82 122)" />
        </clipPath>
      </defs>

      {/* Pink left palm ellipse */}
      <ellipse cx="82" cy="122" rx="68" ry="92" transform="rotate(-22 82 122)" fill="#E8429E" />

      {/* Blue right palm ellipse */}
      <ellipse cx="118" cy="122" rx="68" ry="92" transform="rotate(22 118 122)" fill="#79C4EA" />

      {/* Purple overlap: right ellipse clipped to the left ellipse region */}
      <ellipse
        cx="118" cy="122" rx="68" ry="92" transform="rotate(22 118 122)"
        fill="#9B3FA5"
        clipPath="url(#ukat-pink-clip)"
      />

      {/* Pink thumb arc — curls up and over to the top-right, creating the left heart lobe */}
      <path d="M 100 52 Q 148 8 166 56 Q 174 94 146 114 C 132 100 118 88 100 78 Z" fill="#E8429E" />

      {/* Blue thumb arc — mirrors pink, creates the right heart lobe */}
      <path d="M 100 52 Q 52 8 34 56 Q 26 94 54 114 C 68 100 82 88 100 78 Z" fill="#79C4EA" />

      {/* Purple at the thumb junction where the two arcs meet */}
      <ellipse cx="100" cy="66" rx="9" ry="15" fill="#9B3FA5" />

      {/* Small white highlight gap between thumb tips at the very top */}
      <ellipse cx="100" cy="53" rx="5" ry="8" fill="white" />

      {/* White finger-separation lines fanning out at the bottom */}
      <line x1="87" y1="178" x2="72" y2="210" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="94" y1="184" x2="84" y2="214" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="100" y1="186" x2="100" y2="215" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="106" y1="184" x2="116" y2="214" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="113" y1="178" x2="128" y2="210" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMark({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        'brand-gradient grid size-9 shrink-0 place-items-center rounded-xl shadow-soft',
        className,
      )}
      aria-hidden
    >
      <UkatMark className="size-6" />
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
