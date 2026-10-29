/**
 * A clip's custom thumbnail ("cover"): an image picked by hand to stand in for
 * the clip until it is hovered, in place of the poster grabbed from its first
 * preview frame. It fills the same `posterImageUrl` column, so every reader —
 * the roll, the clip page's <video poster>, the journal, the digest email, the
 * VideoObject thumbnail — picks it up with no change.
 *
 * Which kind a stored poster is, is read off where it lives: covers go under
 * their own prefix. That is what stops "Regenerate preview frames" replacing a
 * hand-picked image with a frame, and it needs no column — so no schema push.
 */

export const COVER_PREFIX = 'covers';

/**
 * Longest edge kept. The poster is drawn far larger on the clip page, before
 * play, than in the roll's 72px row, so this is set by the former — but it is
 * also fetched for every row on /motion, so it stops well short of the photos'
 * 2560. The generated posters are 480px wide.
 */
export const COVER_MAX_EDGE = 1280;

/** True when `url` is a hand-picked cover rather than a grabbed frame. */
export function isCustomPoster(url: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.startsWith(`/${COVER_PREFIX}/`);
  } catch {
    return false;
  }
}
