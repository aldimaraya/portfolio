import type { PhotoLayout } from './content';

/**
 * The trip-photo tray: a post's own uploads, grouped by the day they were taken,
 * by place, or by what they show. Pure, so the grouping a writer sees is tested
 * rather than eyeballed.
 */

export const POST_CATEGORIES = [
  { id: 'food', label: 'Food', prompt: 'Write about the food…' },
  { id: 'sights', label: 'Sights', prompt: 'Write about what you saw…' },
  { id: 'transport', label: 'Getting around', prompt: 'Write about getting around…' },
  { id: 'stay', label: 'Stay', prompt: 'Write about where you stayed…' },
  { id: 'people', label: 'People', prompt: 'Write about the people…' },
] as const;

export type PostCategory = (typeof POST_CATEGORIES)[number]['id'];

export function isPostCategory(value: unknown): value is PostCategory {
  return POST_CATEGORIES.some((category) => category.id === value);
}

export function categoryLabel(id: string | null): string {
  return POST_CATEGORIES.find((category) => category.id === id)?.label ?? 'Untagged';
}

export interface TrayPhoto {
  id: string;
  imageUrl: string;
  /** The tray's small copy; null on rows from before thumbnails, which use imageUrl. */
  thumbUrl: string | null;
  width: number;
  height: number;
  /** Wall-clock capture time in UTC fields — see wallClockAsUtc. */
  takenAt: Date | null;
  category: string | null;
  /** Perceptual hash — see lib/photo/fingerprint.ts. Null until backfilled. */
  fingerprint: string | null;
  /** Town-sized name, from GPS or typed — see lib/geo/place.ts. */
  place: string | null;
}

/**
 * A camera records local time with no zone, and exifr hands it back as a Date in
 * the browser's zone. What a trip's days are made of is that wall-clock reading —
 * a photo taken at 11pm in Seoul belongs to that day wherever the upload happens
 * — so it is stored with the same numbers in UTC and read back with UTC getters,
 * which makes the day the same on the server, in any browser, in any zone.
 */
export function wallClockAsUtc(local: Date): Date {
  return new Date(
    Date.UTC(
      local.getFullYear(),
      local.getMonth(),
      local.getDate(),
      local.getHours(),
      local.getMinutes(),
      local.getSeconds(),
    ),
  );
}

/** YYYY-MM-DD of a wall-clock-as-UTC date. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Thu 14 Mar" for a day key. */
export function formatDayKey(key: string): string {
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export interface TrayDay {
  /** YYYY-MM-DD, or null for the photos with no capture date. */
  key: string | null;
  photos: TrayPhoto[];
}

/** Earliest first; photos with no date sort after every dated one. */
function byTakenAt(a: TrayPhoto, b: TrayPhoto): number {
  const at = a.takenAt?.getTime() ?? Infinity;
  const bt = b.takenAt?.getTime() ?? Infinity;
  return at === bt ? a.id.localeCompare(b.id) : at - bt;
}

/** The tray's photos grouped by the calendar day they were taken, earliest first. */
export function groupByDay(photos: TrayPhoto[]): TrayDay[] {
  const days = new Map<string, TrayPhoto[]>();
  const undated: TrayPhoto[] = [];

  for (const photo of [...photos].sort(byTakenAt)) {
    if (!photo.takenAt) {
      undated.push(photo);
      continue;
    }
    const key = dayKey(photo.takenAt);
    const list = days.get(key) ?? [];
    list.push(photo);
    days.set(key, list);
  }

  const grouped: TrayDay[] = [...days.keys()]
    .sort()
    .map((key) => ({ key, photos: days.get(key)! }));
  if (undated.length) grouped.push({ key: null, photos: undated });
  return grouped;
}

export interface TrayCategoryGroup {
  id: string | null;
  label: string;
  photos: TrayPhoto[];
}

/** The tray's photos grouped by category, in the fixed category order, untagged last. */
export function groupByCategory(photos: TrayPhoto[]): TrayCategoryGroup[] {
  const sorted = [...photos].sort(byTakenAt);
  const groups: TrayCategoryGroup[] = POST_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    photos: sorted.filter((photo) => photo.category === category.id),
  }));
  groups.push({
    id: null,
    label: 'Untagged',
    photos: sorted.filter((photo) => !isPostCategory(photo.category)),
  });
  return groups.filter((group) => group.photos.length > 0);
}

export interface TrayPlaceGroup {
  /** Null for the photos with no place, from GPS or typed. */
  place: string | null;
  photos: TrayPhoto[];
}

/**
 * The tray's photos grouped by where they were taken, in the order the trip
 * reached each place — by its earliest photo — so the groups read as the route.
 * A place visited twice stays one group. Unplaced photos come last.
 */
export function groupByPlace(photos: TrayPhoto[]): TrayPlaceGroup[] {
  const places = new Map<string, TrayPhoto[]>();
  const unplaced: TrayPhoto[] = [];

  for (const photo of [...photos].sort(byTakenAt)) {
    if (!photo.place) {
      unplaced.push(photo);
      continue;
    }
    const list = places.get(photo.place) ?? [];
    list.push(photo);
    places.set(photo.place, list);
  }

  // A Map iterates in insertion order, and photos went in earliest first.
  const grouped: TrayPlaceGroup[] = [...places].map(([place, list]) => ({ place, photos: list }));
  if (unplaced.length) grouped.push({ place: null, photos: unplaced });
  return grouped;
}

/** The layout a set of photos starts in: alone, a row while they fit one, else a grid. */
export function autoLayout(count: number): PhotoLayout {
  if (count <= 1) return 'stacked';
  if (count <= 3) return 'row';
  return 'grid';
}

/** The placeholder a tray-made text block shows, by its category tag. */
export function promptForTag(tag: string | undefined): string | null {
  if (!tag) return null;
  return POST_CATEGORIES.find((category) => category.label === tag)?.prompt ?? 'Write about the rest of the day…';
}
