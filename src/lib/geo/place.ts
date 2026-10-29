/**
 * Where a trip photo was taken, reduced to what the journal needs: a place name
 * to group and tag by. Pure, so the rounding and the naming are tested rather
 * than trusted to a geocoder's mood.
 *
 * The coordinates themselves never leave the server. The published image has
 * them stripped (see keepsOriginal), and the rows keep them only so a place can
 * be looked up again — no select that reaches a browser includes them, the
 * admin's included. Only the name is ever shown.
 */

/**
 * Three decimals is about 110 m of latitude: plenty to name the town, coarse
 * enough that a stored row does not pin the house a photo was taken in. It is
 * also the lookup's cache key, so the photos from one street share one request.
 */
const COORDINATE_DECIMALS = 3;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Rounded to storage precision, or null for anything that is not a real point. */
export function roundCoordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // Null Island: what a camera writes when it has a GPS block and no fix.
  if (latitude === 0 && longitude === 0) return null;
  const round = (value: number) => Number(value.toFixed(COORDINATE_DECIMALS));
  return { latitude: round(latitude), longitude: round(longitude) };
}

/**
 * The town-sized name out of a Nominatim `address`, most specific first. A trip
 * is grouped by where it went — "Kyoto", "Nara" — so a neighbourhood would split
 * one stop into ten and a country would merge the whole trip into one. Out in
 * the country or at sea, the nearest wider area stands in.
 */
const LOCALITY_KEYS = ['city', 'town', 'village', 'municipality', 'hamlet', 'county', 'province', 'state', 'region', 'country'];

export function placeFromAddress(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null;
  const fields = address as Record<string, unknown>;
  for (const key of LOCALITY_KEYS) {
    const name = normalizePlace(fields[key]);
    if (name) return name;
  }
  return null;
}

/** Longest place name kept — a typed one, or a geocoder's. */
export const MAX_PLACE_LENGTH = 80;

/** Trimmed and single-spaced, or null when nothing is left. */
export function normalizePlace(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_PLACE_LENGTH).trim();
  return name || null;
}
