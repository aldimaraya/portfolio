export interface SortablePhoto {
  avgHue: number;
  avgLightness: number;
  isMonochrome: boolean;
}

/**
 * Wall order: a monochrome band sorted dark-to-light, followed by the colour
 * photos sweeping through the hue circle. Packing the result into justified rows
 * in this order makes the hue progress top-to-bottom as you scroll.
 *
 * `filter` copies first, so the input array is never reordered in place.
 */
export function sortPhotosForWall<T extends SortablePhoto>(photos: T[]): T[] {
  const monochrome = photos
    .filter((p) => p.isMonochrome)
    .sort((a, b) => a.avgLightness - b.avgLightness);

  const color = photos.filter((p) => !p.isMonochrome).sort((a, b) => a.avgHue - b.avgHue);

  return [...monochrome, ...color];
}
