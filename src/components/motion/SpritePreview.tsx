/**
 * One frame of the reel, previewed by stepping across the sprite sheet built at
 * upload time (see src/lib/video/sprite.ts). The animation itself lives in
 * globals.css — this only sets the frame count and says whether it should run.
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
      style={{ '--sprite-frames': frames } as React.CSSProperties}
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
