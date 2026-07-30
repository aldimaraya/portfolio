/**
 * Filter state lives in the URL query string so filtered views are shareable.
 * Values are comma-separated per filter type: `?camera=Leica M6,Contax T2`.
 */

export interface MediaFilters {
  cameras: string[];
  locations: string[];
  tags: string[];
}

export const EMPTY_FILTERS: MediaFilters = { cameras: [], locations: [], tags: [] };

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  const cleaned = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(cleaned)];
}

export function parseFilters(params: URLSearchParams): MediaFilters {
  return {
    cameras: readList(params, 'camera'),
    locations: readList(params, 'location'),
    tags: readList(params, 'tag'),
  };
}

export function serializeFilters(filters: MediaFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.cameras.length) params.set('camera', filters.cameras.join(','));
  if (filters.locations.length) params.set('location', filters.locations.join(','));
  if (filters.tags.length) params.set('tag', filters.tags.join(','));
  return params;
}

export function hasActiveFilters(filters: MediaFilters): boolean {
  return (
    filters.cameras.length > 0 || filters.locations.length > 0 || filters.tags.length > 0
  );
}

/**
 * Next.js hands page components a plain object whose values may be string,
 * string[], or undefined. Both the Stills and Motion pages need the same
 * normalisation, so it lives here rather than being pasted into each page.
 */
export function filtersFromSearchParams(
  source: Record<string, string | string[] | undefined>,
): MediaFilters {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value) && value.length > 0) params.set(key, value.join(','));
  }
  return parseFilters(params);
}
