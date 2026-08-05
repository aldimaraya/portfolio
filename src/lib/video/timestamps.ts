/** Frames per preview. With PREVIEW_WINDOW_SECONDS this sets the frame rate. */
export const DEFAULT_SPRITE_FRAMES = 18;

/**
 * How much of the clip a preview covers.
 *
 * Sampling the whole clip instead is what made previews read as a slideshow
 * rather than as motion: a 28s clip put its ten frames 2.8s apart, so the loop
 * cycled ten unrelated moments. Frames taken from a short window are close
 * enough together to be seen as movement, and playing the loop back over that
 * same window length runs the movement at roughly life speed.
 */
export const PREVIEW_WINDOW_SECONDS = 1.5;

/** Where the window opens by default, as a fraction of the clip. Skips titles. */
const WINDOW_START_FRACTION = 0.2;

/** How much of the clip the window covers, given how long the clip is. */
export function windowSpan(
  durationSeconds: number,
  windowSeconds: number = PREVIEW_WINDOW_SECONDS,
): number {
  // A clip shorter than the window is sampled end to end — there is nothing to
  // choose between.
  return Math.min(windowSeconds, durationSeconds);
}

/**
 * Where the preview window opens. Defaults to a fifth of the way in, which is a
 * guess that avoids titles and fades and is right often enough to be worth
 * having; `requested` is that guess overruled by someone who has watched the
 * clip. Either way it is clamped so the window cannot run off the end.
 */
export function windowStart(
  durationSeconds: number,
  windowSeconds: number = PREVIEW_WINDOW_SECONDS,
  requested?: number,
): number {
  const span = windowSpan(durationSeconds, windowSeconds);
  const wanted =
    requested !== undefined && Number.isFinite(requested)
      ? requested
      : durationSeconds * WINDOW_START_FRACTION;
  return Math.max(0, Math.min(wanted, durationSeconds - span));
}

/**
 * Evenly spaced sample points across the preview window, taken at the midpoint of
 * each slice so the first grab is never a slice boundary.
 */
export function computeFrameTimestamps(
  durationSeconds: number,
  frameCount: number = DEFAULT_SPRITE_FRAMES,
  windowSeconds: number = PREVIEW_WINDOW_SECONDS,
  startSeconds?: number,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  if (!Number.isInteger(frameCount) || frameCount < 1) return [];

  const span = windowSpan(durationSeconds, windowSeconds);
  const start = windowStart(durationSeconds, windowSeconds, startSeconds);

  return Array.from({ length: frameCount }, (_, i) => start + ((i + 0.5) / frameCount) * span);
}
