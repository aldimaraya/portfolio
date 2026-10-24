/**
 * A perceptual fingerprint of a photo, for noticing the same picture uploaded
 * twice. It has to survive the re-encode every upload goes through (see
 * keepsOriginal), so it is a hash of what the picture looks like rather than of
 * its bytes: the original file's bytes are never stored, so a byte hash of an
 * upload could never be compared with anything already in the bucket.
 *
 * This is a difference hash: shrink to 9×8, and record for each row whether each
 * pixel is brighter than the one to its right — 64 bits. Brightness gradients
 * survive resizing, recompression and a WebP↔JPEG swap almost untouched, so a
 * re-upload of the same frame lands within a bit or two of the stored one.
 *
 * Pure, and fed from the 100px-wide RGBA sample prepareUpload already draws for
 * colour analysis, so the browser and the backfill script (which shrinks the
 * stored copy to the same width with sharp) take the same path from there on.
 */

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

/**
 * Bits two fingerprints may differ by and still be called the same photo.
 * Measured on this library (26 journal photos, 41 stills, October 2026): the
 * stored copy re-encoded as a 1600px WebP moved 0–2 bits, a 1200px JPEG at q60
 * at most 3, and only a punishing 640px q40 reached 5. Between *different*
 * photos the closest pair was 7 — back-to-back frames of one scene — then 9,
 * then nothing under 13. Kept tight because a false match costs a skipped photo
 * the user has to notice and send anyway, while a miss costs only a duplicate
 * they can delete from the tray.
 * Burst shots of a still scene can still fall inside it, which is why a skip
 * always comes with "Upload anyway". So can two nearly featureless frames — a
 * flat sky hashes close to all zeros.
 */
export const DUPLICATE_DISTANCE = 4;

/** Rec. 601 luma — the weighting is not critical, only that it is fixed. */
function luma(rgba: ArrayLike<number>, index: number): number {
  return 0.299 * rgba[index] + 0.587 * rgba[index + 1] + 0.114 * rgba[index + 2];
}

/**
 * Box-averages an RGBA sample down to the 9×8 the hash compares. Averaging
 * rather than picking pixels is what makes the result independent of how the
 * sample itself was scaled — a canvas and sharp resample differently, and only
 * the averages of whole regions come out the same.
 */
function shrink(rgba: ArrayLike<number>, width: number, height: number): number[] {
  const cells: number[] = [];
  for (let row = 0; row < HASH_HEIGHT; row += 1) {
    const y0 = Math.floor((row * height) / HASH_HEIGHT);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * height) / HASH_HEIGHT));
    for (let col = 0; col < HASH_WIDTH; col += 1) {
      const x0 = Math.floor((col * width) / HASH_WIDTH);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * width) / HASH_WIDTH));
      let sum = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) sum += luma(rgba, (y * width + x) * 4);
      }
      cells.push(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return cells;
}

/** 16 hex characters, or null for a sample too small to say anything. */
export function fingerprintPixels(rgba: ArrayLike<number>, width: number, height: number): string | null {
  if (width < 1 || height < 1 || rgba.length < width * height * 4) return null;

  const cells = shrink(rgba, width, height);
  let hex = '';
  for (let row = 0; row < HASH_HEIGHT; row += 1) {
    let byte = 0;
    for (let col = 0; col < HASH_WIDTH - 1; col += 1) {
      const left = cells[row * HASH_WIDTH + col];
      const right = cells[row * HASH_WIDTH + col + 1];
      byte = (byte << 1) | (left > right ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function isFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);
}

/** Bits that differ between two fingerprints. */
export function fingerprintDistance(a: string, b: string): number {
  let distance = 0;
  for (let index = 0; index < a.length; index += 2) {
    let diff = parseInt(a.slice(index, index + 2), 16) ^ parseInt(b.slice(index, index + 2), 16);
    while (diff) {
      distance += diff & 1;
      diff >>= 1;
    }
  }
  return distance;
}

/**
 * The first candidate that looks like the same photo, or undefined. Candidates
 * without a fingerprint — rows uploaded before there was one, until the backfill
 * runs — never match.
 */
export function findDuplicate<T extends { fingerprint: string | null }>(
  fingerprint: string | null,
  candidates: readonly T[],
): T | undefined {
  if (!fingerprint) return undefined;
  return candidates.find(
    (candidate) =>
      candidate.fingerprint !== null && fingerprintDistance(fingerprint, candidate.fingerprint) <= DUPLICATE_DISTANCE,
  );
}
