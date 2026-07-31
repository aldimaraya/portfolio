import { PREVIEW_WINDOW_SECONDS } from '@/lib/video/timestamps';

/**
 * One frame of the reel, previewed by stepping across the sprite sheet built at
 * upload time (see src/lib/video/sprite.ts). The animation itself lives in
 * globals.css — this only sets the frame count and pace, and says whether it
 * should run.
 *
 * The pace is read from the same constant the frames were sampled with, so the
 * two cannot drift into a preview that plays at the wrong speed.
 */
export function SpritePreview({
  spriteUrl,
  frames,
  active,
  alt,
}: {
  spriteUrl: string;
  frames: number;
  active: boolean;
  alt: string;
}) {
  return (
    <div
      className="sprite-window aspect-video w-full"
      data-active={active ? 'true' : 'false'}
      style={
        {
          '--sprite-frames': frames,
          '--sprite-duration': `${PREVIEW_WINDOW_SECONDS}s`,
        } as React.CSSProperties
      }
    >
      {/* A plain <img>, not next/image: this is one pre-sized sprite sheet that
          must render at `frames × 100%` of its box, which fill/width sizing
          would fight. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={spriteUrl}
        alt={alt}
        loading="lazy"
        className="sprite-strip"
        style={{ width: `${frames * 100}%` }}
      />
    </div>
  );
}
