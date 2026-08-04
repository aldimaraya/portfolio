/**
 * Shaping a clip's box from the clip's own dimensions.
 *
 * Lives in lib rather than beside the component because both surfaces need it
 * and they need it differently: the roll sizes a small fixed-width thumbnail,
 * the clip page sizes a full-width player. Only the ratio is shared.
 */

/**
 * Used when a clip predates stored dimensions. 16:9 is the shape those frames
 * were already being forced into, so an old clip looks no worse than before.
 */
export const FRAME_FALLBACK_RATIO = 16 / 9;

export interface FrameSize {
  width: number;
  height: number;
}

export function frameRatio(video: FrameSize): number {
  if (video.width > 0 && video.height > 0) return video.width / video.height;
  return FRAME_FALLBACK_RATIO;
}

/** A clip taller than it is wide. Portrait clips are laid out narrow, not tall. */
export function isPortrait(video: FrameSize): boolean {
  return frameRatio(video) < 1;
}

/**
 * The two styles the clip page's gate needs, from one ratio.
 *
 * How *tall* the player may stand is not decided here, because the honest limit
 * is the window rather than any figure that can be written down in advance: a
 * fixed cap is either too tall on a laptop — where the frame runs past the fold
 * and the title below it cannot be seen at all — or needlessly short on a large
 * display. So `.clip-gate` in globals.css derives a max-width from this ratio
 * and the height actually left over, which only CSS knows.
 *
 * It stays a max-*width* and not a max-height for the original reason: clamping
 * the height alone leaves the width at 100% and re-stretches the frame.
 *
 * The two cannot be the same object. The panel takes the width budget but must
 * not take the ratio — it is taller than the frame by its slate and its padding,
 * and giving it `aspect-ratio` would squash the clip inside it by exactly that
 * much.
 */
export interface GateStyles {
  /** The bordered panel: takes the width budget, sets no shape of its own. */
  panel: React.CSSProperties;
  /** The frame inside it: takes the shape. */
  frame: React.CSSProperties;
}

/**
 * Takes a ratio rather than a size, because the two callers have different ones:
 * the page starts from the stored dimensions, and the player replaces them with
 * what the file itself reports once it has metadata.
 */
export function gateStyles(ratio: number): GateStyles {
  return {
    // A number, not a string: `.clip-gate` multiplies it by a length in calc(),
    // which a string would make invalid — silently dropping the cap entirely.
    panel: { '--frame-ratio': ratio } as React.CSSProperties,
    frame: { aspectRatio: ratio },
  };
}

/**
 * A thumbnail's width, in pixels, for a row of the given height.
 *
 * The roll's rows are a fixed height so the list scans as a column of equal
 * beats — a portrait clip that stood three times its neighbours would break
 * that. Deriving the width from the ratio at a fixed height is what keeps a
 * vertical clip narrow instead of tall.
 */
export function thumbWidth(video: FrameSize, rowHeight: number): number {
  return Math.round(rowHeight * frameRatio(video));
}
