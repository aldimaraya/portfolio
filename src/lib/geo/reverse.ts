import { siteUrl } from '@/lib/site-url';
import { placeFromAddress, type Coordinates } from './place';

/**
 * Coordinates → place name, through OpenStreetMap's Nominatim. Chosen because it
 * needs no key and no account for a load this size — a trip's worth of photos,
 * a few times a year — and because nothing on the Vercel Marketplace geocodes.
 *
 * Server-only: Nominatim's usage policy asks every client to identify itself in
 * the User-Agent, which a browser will not let a page set, and to send no more
 * than one request a second, which is easier to hold to in one place.
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * The policy also asks for results to be cached. The durable cache is the
 * database — addJournalPhoto reuses a stored row's name for the same rounded
 * point before it calls this — and the map below covers a warm instance between
 * rows that have not been written yet.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 6000;

const cache = new Map<string, string | null>();
let nextSlot = 0;

/**
 * Best-effort, like every EXIF-derived field: a timeout, a refusal or a point in
 * the middle of the sea all come back as null, and the photo is saved without a
 * place rather than not saved at all. A place can always be typed in the tray.
 */
export async function lookUpPlace({ latitude, longitude }: Coordinates): Promise<string | null> {
  const key = `${latitude},${longitude}`;
  if (cache.has(key)) return cache.get(key)!;

  // Reserve the next free slot before waiting, so two concurrent calls on one
  // instance queue up behind each other instead of both firing at once.
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));

  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    // City level — see placeFromAddress for why a town is the unit.
    zoom: '10',
    addressdetails: '1',
  }).toString();

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': `portfolio-journal/1.0 (+${siteUrl()})`,
        // Names as the writer reads them, not in the local script.
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('Place lookup refused', response.status);
      return null;
    }
    const body: unknown = await response.json();
    const place = placeFromAddress((body as { address?: unknown } | null)?.address);
    cache.set(key, place);
    return place;
  } catch (cause) {
    // Not cached: a timeout is worth another go on the next photo from here.
    console.error('Place lookup failed', cause);
    return null;
  }
}
