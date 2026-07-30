import { analyzePixels, type ColorStats } from './analyze';

/**
 * Browser-only: downsample a picked image onto a canvas, read the pixels back,
 * and derive its colour stats plus real dimensions. Runs once at upload time so
 * public pages never recompute this.
 */

export interface ImageAnalysis extends ColorStats {
  width: number;
  height: number;
}

/** Downsample width used for colour analysis — plenty for an average, and fast. */
const SAMPLE_WIDTH = 100;

export async function analyzeImageFile(file: File): Promise<ImageAnalysis> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, SAMPLE_WIDTH / bitmap.width);
    const sampleWidth = Math.max(1, Math.round(bitmap.width * scale));
    const sampleHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not get a 2D canvas context');

    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);

    return {
      ...analyzePixels(data),
      // Dimensions come from the bitmap, not the downsample — the wall needs the
      // real aspect ratio to size each polaroid.
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}
