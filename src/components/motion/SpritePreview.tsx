'use client';

import { useState } from 'react';
import { PREVIEW_WINDOW_SECONDS } from '@/lib/video/timestamps';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * One frame of the reel, previewed by stepping across the sprite sheet built at
 * upload time (see src/lib/video/sprite.ts). The animation itself lives in
 * globals.css — this only sets the frame count and pace, and says whether it
 * should run.
 *
 * The pace is read from the same constant the frames were sampled with, so the
 * two cannot drift into a preview that plays at the wrong speed.
 *
 * At rest a row shows only frame one, and the sheet is eighteen of them: half a
 * megabyte or more to paint a 72px thumbnail, with nothing on screen until all
 * of it had arrived. So the poster — that same first frame, ~35 KB — stands in,
 * and the sheet is fetched the first time a preview is asked for. A phone never
 * hovers, and reduced motion never animates, so neither fetches one at all.
 */
export function SpritePreview({
  spriteUrl,
  posterUrl,
  frames,
  active,
  alt,
  boxStyle,
  className = '',
  onSettled,
}: {
  spriteUrl: string;
  posterUrl: string;
  frames: number;
  active: boolean;
  alt: string;
  /** Shapes the window to the clip — see lib/video/frame.ts. */
  boxStyle: React.CSSProperties;
  /**
   * The two surfaces size this differently — the roll gives it an explicit
   * width and height, the clip page lets it fill the column — so sizing is the
   * caller's, and no default width is imposed here.
   */
  className?: string;
  /** Reports the poster as landed or failed, so a caller can gate on it. */
  onSettled?: () => void;
}) {
  // Set during render rather than in an effect, so the sheet's request goes out
  // in the same commit as the hover rather than one frame after it. Never unset:
  // once fetched, the sheet stays, and a second hover starts at once.
  const [armed, setArmed] = useState(false);
  if (active && !armed && !prefersReducedMotion()) setArmed(true);

  return (
    <div
      className={`sprite-window ${className}`}
      data-active={active ? 'true' : 'false'}
      style={
        {
          ...boxStyle,
          '--sprite-frames': frames,
          '--sprite-duration': `${PREVIEW_WINDOW_SECONDS}s`,
        } as React.CSSProperties
      }
    >
      {/* Plain <img>s, not next/image: video assets are served straight from R2,
          and the strip is one pre-sized sheet that must render at
          `frames × 100%` of its box, which fill/width sizing would fight. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // A poster already in the cache can finish loading before hydration has
        // attached onLoad, and then never reports — so a complete image reports
        // as it mounts. Reporting twice is harmless; never reporting would hold
        // a gate until its cap.
        ref={(node) => {
          if (node?.complete) onSettled?.();
        }}
        src={posterUrl}
        alt={alt}
        onLoad={onSettled}
        onError={onSettled}
        loading="lazy"
        className="sprite-poster"
      />
      {armed ? (
        // Decorative over the poster, which already carries the alt text.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={spriteUrl}
          alt=""
          className="sprite-strip"
          style={{ width: `${frames * 100}%` }}
        />
      ) : null}
    </div>
  );
}
