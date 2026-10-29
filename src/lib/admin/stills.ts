import { sortPhotosForWall, type SortablePhoto } from '@/lib/color/sort';

/**
 * The admin Stills library's filters and orders. Kept apart from the public
 * wall's (lib/filters) because they answer a different question: not "show me
 * Seoul at night" but "what still needs fixing".
 */

export interface LibraryPhoto extends SortablePhoto {
  title: string;
  location: string;
  camera: string;
  tags: string[];
  createdAt: Date;
}

export type StillsFilter = 'all' | 'undated' | 'untagged' | 'untitled' | 'week';
export type StillsOrder = 'wall' | 'added' | 'taken';

export const FILTER_LABELS: Record<StillsFilter, string> = {
  all: 'All',
  undated: 'No date',
  untagged: 'Untagged',
  untitled: 'Untitled',
  week: 'Added this week',
};

// Key order is button order.
export const ORDER_LABELS: Record<StillsOrder, string> = {
  taken: 'Date taken',
  wall: 'Wall order',
  added: 'Recently added',
};

/** The public wall's default (newest by capture date), so the library opens looking like the site. */
export const DEFAULT_ORDER: StillsOrder = 'taken';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Own keys only: `in` would also accept "toString" and friends off the prototype.
export function parseFilter(value: string | null | undefined): StillsFilter {
  return value && Object.hasOwn(FILTER_LABELS, value) ? (value as StillsFilter) : 'all';
}

export function parseOrder(value: string | null | undefined): StillsOrder {
  return value && Object.hasOwn(ORDER_LABELS, value) ? (value as StillsOrder) : DEFAULT_ORDER;
}

export function matchesFilter(photo: LibraryPhoto, filter: StillsFilter, now: number): boolean {
  switch (filter) {
    case 'undated':
      return !photo.takenAt;
    case 'untagged':
      return photo.tags.length === 0;
    case 'untitled':
      // Trimmed like the photo actions trim, so a stray space still counts as untitled.
      return photo.title.trim() === '';
    case 'week':
      return now - photo.createdAt.getTime() < WEEK_MS;
    default:
      return true;
  }
}

/** Every word must appear somewhere in the title, place, camera or tags. */
export function matchesQuery(photo: LibraryPhoto, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [photo.title, photo.location, photo.camera, ...photo.tags].join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function orderStills<T extends LibraryPhoto>(photos: T[], order: StillsOrder): T[] {
  if (order === 'wall') return sortPhotosForWall(photos, 'warm');
  // Undated photos trail the dated ones, as on the public wall.
  if (order === 'taken') return sortPhotosForWall(photos, 'newest');
  return [...photos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function selectStills<T extends LibraryPhoto>(
  photos: T[],
  { filter, order, query, now }: { filter: StillsFilter; order: StillsOrder; query: string; now: number },
): T[] {
  return orderStills(
    photos.filter((photo) => matchesFilter(photo, filter, now) && matchesQuery(photo, query)),
    order,
  );
}

/**
 * Where a photo sits on the cool↔warm sweep, 0–1, for the inspector's marker.
 * Null for monochrome photos, which sit in their own band ahead of the sweep.
 * Scaled to the library's own range rather than warmth's theoretical one, so the
 * marker uses the whole bar.
 */
export function warmthPosition(photo: SortablePhoto, library: readonly SortablePhoto[]): number | null {
  if (photo.isMonochrome) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const other of library) {
    if (other.isMonochrome) continue;
    min = Math.min(min, other.warmth);
    max = Math.max(max, other.warmth);
  }
  if (!(max > min)) return 0.5;
  return (photo.warmth - min) / (max - min);
}
