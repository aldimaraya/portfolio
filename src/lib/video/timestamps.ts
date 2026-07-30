export const DEFAULT_SPRITE_FRAMES = 10;

/**
 * Evenly spaced sample points across a clip, taken at the midpoint of each slice
 * so the first grab is never the (usually black) opening frame.
 */
export function computeFrameTimestamps(
  durationSeconds: number,
  frameCount: number = DEFAULT_SPRITE_FRAMES,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  if (!Number.isInteger(frameCount) || frameCount < 1) return [];

  return Array.from(
    { length: frameCount },
    (_, i) => ((i + 0.5) / frameCount) * durationSeconds,
  );
}
