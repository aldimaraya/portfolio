import type { FilterablePhoto, FilterOptions } from './apply';
import { EMPTY_FILTERS, type MediaFilters } from './parse';

/**
 * Counts and lookup for the facet panel. Pure, so the panel's arithmetic is
 * tested apart from its markup.
 */

export type FacetKey = keyof MediaFilters;
export type FacetCounts = Record<FacetKey, Map<string, number>>;
export type FacetOrder = 'alpha' | 'count';

const KEYS: FacetKey[] = ['cameras', 'locations', 'tags'];

function valuesOf(photo: FilterablePhoto, key: FacetKey): string[] {
  if (key === 'cameras') return photo.camera ? [photo.camera] : [];
  if (key === 'locations') return photo.location ? [photo.location] : [];
  return photo.tags;
}

function matchesExcept(photo: FilterablePhoto, filters: MediaFilters, skip: FacetKey): boolean {
  return KEYS.every((key) => {
    if (key === skip || filters[key].length === 0) return true;
    return valuesOf(photo, key).some((value) => filters[key].includes(value));
  });
}

/**
 * How many photos each value would show, given the other facets' selections.
 *
 * A facet ignores its own selection when counting, which is what makes the
 * numbers honest under OR-within-a-type: with Granada picked, Lisbon's count is
 * what picking Lisbon *adds*, not zero because no photo is in both. Across types
 * the selections do apply, so with a GoPro picked a city it never visited reads
 * 0 — the count a visitor needs before a click empties the wall.
 */
export function facetCounts(photos: FilterablePhoto[], filters: MediaFilters): FacetCounts {
  const counts: FacetCounts = {
    cameras: new Map(),
    locations: new Map(),
    tags: new Map(),
  };
  for (const photo of photos) {
    for (const key of KEYS) {
      if (!matchesExcept(photo, filters, key)) continue;
      // A tag repeated on one photo is still one photo.
      for (const value of new Set(valuesOf(photo, key))) {
        counts[key].set(value, (counts[key].get(value) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Library-wide totals: the stable ordering for "most photos first". */
export function facetTotals(photos: FilterablePhoto[]): FacetCounts {
  return facetCounts(photos, EMPTY_FILTERS);
}

/** Case- and accent-blind, so "sao" finds São Paulo and "zur" finds Zürich. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function matchesQuery(value: string, query: string): boolean {
  const needle = fold(query);
  return needle === '' || fold(value).includes(needle);
}

/**
 * The values a group lists, narrowed by the search box and put in order.
 *
 * "Most" sorts on library-wide totals rather than the live counts. The live
 * numbers change with every click, and a list that re-shuffles under the cursor
 * mid-selection is the same failure optionsFromPhotos guards against by never
 * narrowing the options.
 */
export function listFacet(
  options: FilterOptions,
  key: FacetKey,
  totals: FacetCounts,
  order: FacetOrder,
  query: string,
): string[] {
  const values = options[key].filter((value) => matchesQuery(value, query));
  if (order === 'alpha') return values;
  return [...values].sort(
    (a, b) => (totals[key].get(b) ?? 0) - (totals[key].get(a) ?? 0) || a.localeCompare(b),
  );
}
