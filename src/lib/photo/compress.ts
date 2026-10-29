/**
 * The policy for re-encoding a picked photo to a web-sized WebP before upload:
 * how large, how lossy, and what the file ends up called. The encoding itself
 * lives in ./trim-client.ts, which does it in the same pass as the border crop.
 *
 * Originals off a camera run to tens of megabytes, and every one of those bytes
 * is paid for twice — once storing it in R2, and again each time the image
 * optimiser has to fetch and transcode it on a cold request. The lightbox is the
 * largest anything is ever displayed at, so anything beyond MAX_EDGE is detail
 * no visitor can see.
 *
 * Lossy and one-way: the compressed file is what reaches R2, so keep masters
 * locally if they might be re-exported or printed.
 */

/** Longest edge kept, in CSS pixels doubled for high-density screens. */
export const MAX_EDGE = 2560;

/**
 * WebP quality, and JPEG's on a browser that cannot encode WebP. 0.85 is the
 * usual point where artefacts stop being visible.
 */
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

/** Extensions for the formats the encoder can actually produce — see encode in ./trim-client.ts. */
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * Swaps the extension for the one `type` was encoded as, since the bytes are no
 * longer the original format. Taken from the encoded blob rather than assumed:
 * a browser that cannot write the format it was asked for hands back another
 * one without saying so, and a name that lies about its bytes is how ten PNGs
 * came to be stored as .webp.
 */
export function encodedFilename(name: string, type: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'photo'}.${EXTENSIONS[type] ?? 'bin'}`;
}
