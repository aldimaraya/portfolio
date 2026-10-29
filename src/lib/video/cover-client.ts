/**
 * The browser half of ./cover.ts: turns a picked image into the cover that gets
 * uploaded.
 *
 * Always re-encoded, never uploaded as picked. A photo straight off a camera or
 * phone carries EXIF, GPS included, and the canvas round-trip is what strips it —
 * the same rule prepareUpload applies to stills, for the same reason.
 */

import { decodeImage } from '../photo/trim-client';
import { QUALITY, encodedFilename, targetSize } from '../photo/compress';
import { encodeCanvas } from '../image/encode-client';
import { COVER_MAX_EDGE } from './cover';

export async function prepareCover(picked: File): Promise<File> {
  // Upright, so a portrait phone photo is not stored on its side once the EXIF
  // that said how to rotate it is gone.
  const bitmap = await decodeImage(picked);
  try {
    const { width, height } = targetSize(bitmap.width, bitmap.height, COVER_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get a 2D canvas context');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await encodeCanvas(canvas, QUALITY);
    return new File([blob], encodedFilename(picked.name, blob.type), { type: blob.type });
  } finally {
    bitmap.close();
  }
}
