import type { MediaFilters } from './parse';

/**
 * Filtering the wall in the browser rather than in Postgres.
 *
 * The stills page already sends every photo to the client — the wall needs all of
 * them to pack its rows — so a filtered view was costing a database round-trip to
 * produce a subset of data the browser was about to receive anyway. Doing it here
 * makes a chip click instant, keeps the page itself static, and removes the
 * second query that existed only to collect the facets.
 *
 * The semantics are the ones buildPhotoWhere used to express in SQL, and they
 * have to stay identical or a shared link would resolve differently than the
 * chips that produced it: OR within a filter type, AND across types.
 */

export interface FilterablePhoto {
  camera: string;
  location: string;
  tags: string[];
}

export interface FilterOptions {
  cameras: string[];
  locations: string[];
  tags: string[];
}

/** OR within a type: an empty list is "no opinion", not "match nothing". */
function matchesAny(value: string, selected: string[]): boolean {
  return selected.length === 0 || selected.includes(value);
}

export function matchesFilters(photo: FilterablePhoto, filters: MediaFilters): boolean {
  return (
    matchesAny(photo.camera, filters.cameras) &&
    matchesAny(photo.location, filters.locations) &&
    (filters.tags.length === 0 || photo.tags.some((tag) => filters.tags.includes(tag)))
  );
}

export function filterPhotos<T extends FilterablePhoto>(
  photos: T[],
  filters: MediaFilters,
): T[] {
  return photos.filter((photo) => matchesFilters(photo, filters));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * The facets to offer, derived from the whole library rather than from what is
 * currently showing. Narrowing these to the visible subset would delete the chip
 * you just clicked out from under the cursor — the same reason the old database
 * version deliberately ignored the active filters.
 */
export function optionsFromPhotos(photos: FilterablePhoto[]): FilterOptions {
  return {
    cameras: unique(photos.map((photo) => photo.camera)),
    locations: unique(photos.map((photo) => photo.location)),
    tags: unique(photos.flatMap((photo) => photo.tags)),
  };
}
