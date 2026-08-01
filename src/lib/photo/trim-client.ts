/**
 * Browser half of the border trimmer: decoding, detection at a sane sample size,
 * and re-encoding the crop. The detection itself lives in ./border.ts, which is
 * pure so it can be tested without a canvas.
 */

import {
  DEFAULT_BORDER_OPTIONS,
  cropRect,
  detectBorderInsets,
  hasBorder,
  scaleInsets,
  type BorderInsets,
  type BorderOptions,
} from './border';
import { QUALITY, targetSize, webpFilename } from './compress';

/**
 * Longest edge the detector samples at. A frame edge is a large feature, so full
 * resolution buys no accuracy — and reading 6 megapixels back off a canvas
 * stalls the tab for a noticeable beat.
 */
const DETECT_EDGE = 1200;

export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  // 'from-image' gives an upright bitmap, so detection, the crop and the colour
  // sample all measure the picture as it will actually be displayed — no EXIF
  // orientation correction on top.
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

function drawToCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  source?: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not get a 2D canvas context');

  if (source) {
    context.drawImage(
      bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      width,
      height,
    );
  } else {
    context.drawImage(bitmap, 0, 0, width, height);
  }
  return canvas;
}

/**
 * Detects the border on a downsampled copy and returns the insets in the
 * bitmap's own pixels, so callers never have to think about the sample scale.
 */
export function detectBorder(
  bitmap: ImageBitmap,
  options: BorderOptions = DEFAULT_BORDER_OPTIONS,
): BorderInsets {
  const sample = targetSize(bitmap.width, bitmap.height, DETECT_EDGE);
  const canvas = drawToCanvas(bitmap, sample.width, sample.height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const { data } = context.getImageData(0, 0, sample.width, sample.height);

  const insets = detectBorderInsets(
    { data, width: sample.width, height: sample.height },
    options,
  );
  return scaleInsets(insets, bitmap.width / sample.width);
}

export interface TrimmedImage {
  file: File;
  width: number;
  height: number;
  /** Pixels of the trimmed image, for re-deriving colour stats. */
  pixels: Uint8ClampedArray;
  sampleWidth: number;
  sampleHeight: number;
}

/** Downsample width for colour analysis — plenty for an average, and fast. */
const SAMPLE_WIDTH = 100;

/**
 * Crops `bitmap` by `insets` and encodes the result as WebP, at the same size
 * ceiling and quality as an ordinary upload. Also returns a downsampled copy of
 * the *cropped* pixels: a white frame drags average lightness up and saturation
 * down, so the stored colour stats have to be re-derived from the trimmed image
 * or the wall keeps sorting by the border.
 */
export async function renderTrimmed(
  bitmap: ImageBitmap,
  insets: BorderInsets,
  filename: string,
): Promise<TrimmedImage> {
  const rect = cropRect(bitmap.width, bitmap.height, insets);
  const { width, height } = targetSize(rect.width, rect.height);

  const canvas = drawToCanvas(bitmap, width, height, rect);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', QUALITY);
  });
  if (!blob) throw new Error('Could not encode the trimmed image');

  const scale = Math.min(1, SAMPLE_WIDTH / width);
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));
  const sample = drawToCanvas(bitmap, sampleWidth, sampleHeight, rect);
  const { data } = sample
    .getContext('2d', { willReadFrequently: true })!
    .getImageData(0, 0, sampleWidth, sampleHeight);

  return {
    file: new File([blob], webpFilename(filename), { type: 'image/webp' }),
    width,
    height,
    pixels: data,
    sampleWidth,
    sampleHeight,
  };
}

export interface ReEncodeComparison {
  insets: BorderInsets;
  sourceWidth: number;
  sourceHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  originalBytes: number;
  renderedBytes: number;
  /**
   * Whether the original file carries EXIF. Keeping those bytes publishes it
   * verbatim — see keepsOriginal.
   */
  originalHasMetadata: boolean;
}

/**
 * True when the re-encode is not worth keeping: nothing was cropped, nothing was
 * scaled down, and WebP came out no smaller. An already-optimised web JPEG can
 * grow through WebP, and re-encoding it would cost quality for nothing.
 *
 * A file with EXIF is always re-encoded regardless. The canvas round-trip is the
 * only thing standing between a photo's GPS coordinates and a public bucket, so
 * whether they are published must not come down to which encoder won on bytes.
 * The size optimisation still applies where it was aimed — a stripped web export
 * has no metadata to leak.
 *
 * Split out from prepareUpload so the rule is testable without a canvas.
 */
export function keepsOriginal(comparison: ReEncodeComparison): boolean {
  return (
    !comparison.originalHasMetadata &&
    !hasBorder(comparison.insets) &&
    comparison.renderedWidth === comparison.sourceWidth &&
    comparison.renderedHeight === comparison.sourceHeight &&
    comparison.renderedBytes >= comparison.originalBytes
  );
}

/**
 * What an upload needs from a picked file: the bytes to send, their true
 * dimensions, and pixels to derive colour stats from. One decode and one crop
 * pass covers all three, which is why the upload form no longer compresses and
 * analyses the file separately.
 */
export async function prepareUpload(
  bitmap: ImageBitmap,
  insets: BorderInsets,
  original: File,
  /**
   * Whether `original` carries EXIF, which the caller has already parsed. True
   * forces the re-encode, so nothing with location data in it is uploaded
   * verbatim — defaulted to that safer answer for a caller that does not know.
   */
  originalHasMetadata = true,
): Promise<TrimmedImage> {
  const rendered = await renderTrimmed(bitmap, insets, original.name);

  const keep = keepsOriginal({
    insets,
    sourceWidth: bitmap.width,
    sourceHeight: bitmap.height,
    renderedWidth: rendered.width,
    renderedHeight: rendered.height,
    originalBytes: original.size,
    renderedBytes: rendered.file.size,
    originalHasMetadata,
  });

  // Same picture either way, so the sampled pixels still describe these bytes.
  return keep ? { ...rendered, file: original } : rendered;
}
