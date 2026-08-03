export interface SortablePhoto {
  avgLightness: number;
  warmth: number;
  isMonochrome: boolean;
  /** Null for most of the library — see Photo.takenAt in schema.prisma. */
  takenAt?: Date | null;
}

/** The wall orders the visitor can pick between, as stored in `?sort=`. */
export type WallSort = 'warm' | 'cool' | 'newest' | 'oldest' | 'random';

export const DEFAULT_SORT: WallSort = 'newest';

export const SORT_LABELS: Record<WallSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  warm: 'Cool → Warm',
  cool: 'Warm → Cool',
  random: 'Shuffle',
};

export const SORT_ORDER: WallSort[] = ['newest', 'oldest', 'warm', 'cool', 'random'];

export function parseSort(value: string | null | undefined): WallSort {
  return SORT_ORDER.includes(value as WallSort) ? (value as WallSort) : DEFAULT_SORT;
}

/**
 * The shuffle is seeded from the URL rather than from Math.random at render
 * time. Every other order is a pure function of the photos, so the wall only
 * re-packs when the visitor asks it to; an unseeded shuffle would deal a new
 * wall on every filter click and every re-render, which reads as a bug. A seed
 * in the query string also makes a shuffled wall the same shareable link the
 * filtered ones are.
 */
export function parseSeed(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? Math.trunc(parsed) : 1;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

/** mulberry32 — small, fast, and good enough to deal photographs. */
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shufflePhotos<T>(photos: T[], seed: number): T[] {
  const next = randomFrom(seed);
  const result = [...photos];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Wall order: a monochrome band sorted dark-to-light, then the colour photos
 * sweeping cool to warm. Packing the result into justified rows in this order
 * makes the wall drift from night blues to golden hour as you scroll.
 *
 * Sorting on warmth rather than hue is what makes this work on documentary
 * photography, where most frames hold several colours and none of them dominates
 * — see analyzePixels. Warmth needs no confidence gate the way a hue angle did:
 * it is well defined for every photo, and a frame with no colour identity lands
 * mid-scale, which is both honest and where it looks right.
 *
 * Reversing is a whole-wall flip rather than a per-band one: warm→cool ends on
 * the monochrome band running light-to-dark, which reads as the same journey
 * walked backwards. Sorting each band separately would instead put the greys
 * back at the front, which looks like a different wall, not a reversed one.
 *
 * `filter` copies first, so the input array is never reordered in place.
 */
export function sortPhotosForWall<T extends SortablePhoto>(
  photos: T[],
  // The colour sweep, not DEFAULT_SORT: this function's own subject is the
  // colour order, and callers that want the wall's default say so explicitly.
  sort: WallSort = 'warm',
  seed = 1,
): T[] {
  if (sort === 'random') return shufflePhotos(photos, seed);
  if (sort === 'newest' || sort === 'oldest') return sortPhotosByDate(photos, sort);

  const monochrome = photos
    .filter((p) => p.isMonochrome)
    .sort((a, b) => a.avgLightness - b.avgLightness);

  const color = photos.filter((p) => !p.isMonochrome).sort((a, b) => a.warmth - b.warmth);

  const ordered = [...monochrome, ...color];
  return sort === 'cool' ? ordered.reverse() : ordered;
}

/**
 * Dated photos in the chosen direction, undated ones after them in both — a
 * photo with no takenAt has no place on a timeline, and falling back to its
 * upload date would put it there anyway while claiming a date it never had.
 * Array#sort is stable, so the undated tail keeps whatever order it arrived in
 * (the query's createdAt desc).
 */
function sortPhotosByDate<T extends SortablePhoto>(
  photos: T[],
  sort: 'newest' | 'oldest',
): T[] {
  const direction = sort === 'newest' ? -1 : 1;
  return [...photos].sort((a, b) => {
    const left = a.takenAt?.getTime();
    const right = b.takenAt?.getTime();
    if (left === undefined) return right === undefined ? 0 : 1;
    if (right === undefined) return -1;
    return (left - right) * direction;
  });
}
