export interface SortablePhoto {
  avgLightness: number;
  warmth: number;
  isMonochrome: boolean;
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
 * `filter` copies first, so the input array is never reordered in place.
 */
export function sortPhotosForWall<T extends SortablePhoto>(photos: T[]): T[] {
  const monochrome = photos
    .filter((p) => p.isMonochrome)
    .sort((a, b) => a.avgLightness - b.avgLightness);

  const color = photos.filter((p) => !p.isMonochrome).sort((a, b) => a.warmth - b.warmth);

  return [...monochrome, ...color];
}
