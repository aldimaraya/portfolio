'use client';

import { useState } from 'react';
import type { LikeableKind } from '@/lib/engagement/kinds';
import { formatCount } from '@/lib/engagement/format';
import { useEngagement } from './useEngagement';

/**
 * A heart and its count.
 *
 * `inline` is a bare heart set in with a line of mono text, where the line
 * around it already says what it is — the clip page's meta line. `pill` says
 * "Like" in words inside a bordered control, for where it stands on its own:
 * a lone heart under a caption read as an ornament, and nobody thought to
 * press it.
 *
 * `tone` is the surface: the site's near-black, or the lightbox's paper mat,
 * where the site's gold falls to about 2:1 and the mat's own darker pair is
 * used instead (see --color-matmeta).
 */
export function LikeButton({
  kind,
  id,
  view = false,
  variant = 'inline',
  tone = 'dark',
  className = '',
}: {
  kind: LikeableKind;
  id: string;
  /** Record a view on the way — only on the page that is the item. See useEngagement. */
  view?: boolean;
  variant?: 'inline' | 'pill';
  tone?: 'dark' | 'mat';
  className?: string;
}) {
  const { counts, toggleLike } = useEngagement(kind, id, { view });
  const liked = counts?.liked ?? false;
  const printed = formatCount(counts?.likes ?? 0);
  // Set by a click, never by the counts arriving: a heart already filled when
  // the page loads has nothing to celebrate.
  const [popped, setPopped] = useState(false);

  const look =
    variant === 'inline'
      ? `gap-1.5 text-[0.7rem] ${liked ? 'text-gold' : 'text-ash hover:text-gold'}`
      : `gap-2 rounded-full border px-3.5 py-1.5 text-[0.7rem] uppercase ${PILL[tone][liked ? 'on' : 'off']}`;

  return (
    <button
      type="button"
      // Pressed state, and a fixed name: a screen reader announces "Like,
      // toggle button, pressed", which is the whole story — the visible
      // "Liked" would only repeat it.
      aria-pressed={liked}
      aria-label={printed ? `Like (${counts?.likes})` : 'Like'}
      // Disabled until the counts land: there is no state to change from yet,
      // and a click that did nothing would read as broken.
      disabled={!counts}
      onClick={(event) => {
        // In the lightbox a click that bubbles is a dismissal.
        event.stopPropagation();
        setPopped(!liked);
        toggleLike();
      }}
      // Present but dimmed before the counts arrive rather than appearing a
      // beat late, so nothing beside it shifts when they do. Dimmed, not
      // faded out: at 40% it was simply not there.
      className={`like-button inline-flex cursor-pointer items-center font-mono tracking-[0.08em] tabular-nums transition disabled:cursor-default disabled:opacity-60 ${look} ${className}`}
      data-popped={popped && liked ? 'true' : undefined}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className={`like-heart ${variant === 'pill' ? 'size-4' : 'size-3.5'}`}
        fill={liked ? 'currentColor' : 'none'}
      >
        <path
          d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      {variant === 'pill' ? <span>{liked ? 'Liked' : 'Like'}</span> : null}
      {printed ? (
        <span className={variant === 'pill' ? 'border-l border-current/30 pl-2' : ''}>{printed}</span>
      ) : null}
    </button>
  );
}

/** Liked fills the pill rather than only the heart, so the state reads from across the room. */
const PILL = {
  dark: {
    off: 'border-white/25 text-bone hover:border-gold hover:text-gold',
    on: 'border-gold bg-gold/15 text-gold',
  },
  mat: {
    off: 'border-matmeta/50 text-matink hover:border-matmeta hover:bg-matmeta/10',
    on: 'border-matmeta bg-matmeta text-mat',
  },
} as const;
