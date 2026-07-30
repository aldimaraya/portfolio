import { DEFAULT_SPRITE_FRAMES } from './timestamps';

/**
 * Browser-only sprite-sheet generation. The browser already holds the video file
 * for upload, so it seeks to each timestamp, draws the frame to a canvas, and
 * tiles them into one wide strip — which keeps the "no server-side transcoding"
 * constraint intact (no ffmpeg anywhere).
 *
 * The first frame doubles as the poster when none is supplied separately.
 *
 * STUB — implement in plan Task 12.
 */

export interface SpriteResult {
  spriteBlob: Blob;
  posterBlob: Blob;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
}

export const DEFAULT_SPRITE_FRAME_WIDTH = 320;

export async function generateSpriteSheet(
  file: File,
  frameCount: number = DEFAULT_SPRITE_FRAMES,
  frameWidth: number = DEFAULT_SPRITE_FRAME_WIDTH,
): Promise<SpriteResult> {
  throw new Error(
    `generateSpriteSheet(${file.name}, ${frameCount}, ${frameWidth}): not implemented — see plan Task 12`,
  );
}
