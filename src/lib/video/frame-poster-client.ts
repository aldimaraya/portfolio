/**
 * A thumbnail cut from a clip's own scrub strip, for the Motion inspector's
 * frame picker. The strip's frames are drawn at the same 480px width as the
 * generated poster (DEFAULT_SPRITE_FRAME_WIDTH), so a picked frame is exactly
 * what Regenerate would have made had the window opened on it — and, like that
 * poster, it lives under `posters/`, so the next regenerate replaces it with the
 * new strip's first frame rather than keeping a frame from a strip that is gone.
 *
 * The strip is read back through our own origin: drawn from the public R2 host,
 * the canvas would be tainted and refuse to encode. See streamStoredObject.
 */

import { encodeCanvas } from '../image/encode-client';
import { QUALITY } from '../photo/compress';

/** Fetches the stored strip once, decoded, for any number of cuts. */
export async function loadSprite(spriteUrl: string): Promise<ImageBitmap> {
  const response = await fetch(`/api/admin/photo-source?url=${encodeURIComponent(spriteUrl)}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? 'Could not fetch the preview frames');
  }
  return createImageBitmap(await response.blob());
}

/** Frame `index` of `frames` laid side by side, encoded as a poster. */
export async function cutFrame(sprite: ImageBitmap, frames: number, index: number): Promise<Blob> {
  // Rounded per edge rather than once, so the last frame takes any odd pixel the
  // strip's width does not divide evenly into.
  const left = Math.round((sprite.width * index) / frames);
  const width = Math.round((sprite.width * (index + 1)) / frames) - left;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = sprite.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get a 2D canvas context');
  context.drawImage(sprite, left, 0, width, sprite.height, 0, 0, width, sprite.height);
  return encodeCanvas(canvas, QUALITY);
}
