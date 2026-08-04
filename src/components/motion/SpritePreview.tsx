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
  boxStyle,
  onSettled,
}: {
  spriteUrl: string;
  frames: number;
  active: boolean;
  alt: string;
  /** Shapes the window to the clip — see frameBoxStyle in FilmFrame. */
  boxStyle: React.CSSProperties;
  /** Reports the sheet as landed or failed, so the reel knows when to unwind. */
  onSettled?: () => void;
}) {
  return (
    <div
      className="sprite-window mx-auto w-full"
      data-active={active ? 'true' : 'false'}
      style={
        {
          ...boxStyle,
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
        onLoad={onSettled}
        onError={onSettled}
        loading="lazy"
        className="sprite-strip"
        style={{ width: `${frames * 100}%` }}
      />
    </div>
  );
}
