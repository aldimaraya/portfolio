/**
 * Browser-only: re-encode a picked photo to a web-sized WebP before it is
 * uploaded. Originals off a camera run to tens of megabytes, and every one of
 * those bytes is paid for twice — once storing it in R2, and again each time the
 * image optimiser has to fetch and transcode it on a cold request. The lightbox
 * is the largest anything is ever displayed at, so anything beyond MAX_EDGE is
 * detail no visitor can see.
 *
 * Lossy and one-way: the compressed file is what reaches R2, so keep masters
 * locally if they might be re-exported or printed.
 */

/** Longest edge kept, in CSS pixels doubled for high-density screens. */
export const MAX_EDGE = 2560;

/** WebP quality. 0.85 is the usual point where artefacts stop being visible. */
export const QUALITY = 0.85;

export interface TargetSize {
  width: number;
  height: number;
}

/**
 * Scales `width`×`height` so its longest edge is at most `maxEdge`, preserving
 * the aspect ratio. Images already within bounds are returned untouched rather
 * than scaled up — enlarging invents detail and costs bytes.
 */
export function targetSize(width: number, height: number, maxEdge = MAX_EDGE): TargetSize {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Swaps the extension for .webp, since the bytes are no longer the original format. */
export function webpFilename(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'photo'}.webp`;
}

export interface CompressedPhoto {
  file: File;
  /** Dimensions of the re-encoded file — the ones the record must store. */
  width: number;
  height: number;
}

/**
 * Downscales and re-encodes `file`. Returns the result along with its true
 * dimensions, which the caller must persist: the wall sizes each frame from the
 * stored ratio, so storing the original's dimensions against a resized file
 * would be a quiet mismatch.
 *
 * EXIF does not survive a canvas round-trip. Read metadata from the original
 * file before calling this — see PhotoForm.handleSelect.
 */
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  // 'from-image' matches analyzeImageFile: the bitmap comes out upright, so the
  // dimensions here and there describe the same picture.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = targetSize(bitmap.width, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get a 2D canvas context');
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', QUALITY);
    });
    if (!blob) throw new Error('Could not encode the image');

    // Keep whichever is smaller. An already-optimised web JPEG can come out
    // larger through WebP, and re-encoding it would cost quality for nothing.
    if (blob.size >= file.size && width === bitmap.width && height === bitmap.height) {
      return { file, width: bitmap.width, height: bitmap.height };
    }

    return {
      file: new File([blob], webpFilename(file.name), { type: 'image/webp' }),
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}
