import { emptyRichText, newBlockId, type Block, type PhotoLayout } from './content';

/**
 * The trip-photo tray: a post's own uploads, grouped by the day they were taken
 * and tagged by what they show, and turned into a skeleton of the post on
 * request. Pure, so the grouping a writer sees and the blocks it produces are
 * tested rather than eyeballed.
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
  /** 1-based position among the dated days; null for the undated group. */
  number: number | null;
  photos: TrayPhoto[];
}

/** Earliest first; photos with no date sort after every dated one. */
function byTakenAt(a: TrayPhoto, b: TrayPhoto): number {
  const at = a.takenAt?.getTime() ?? Infinity;
  const bt = b.takenAt?.getTime() ?? Infinity;
  return at === bt ? a.id.localeCompare(b.id) : at - bt;
}

/**
 * The tray's photos grouped into days of the trip, in order, numbered from the
 * first day anything was taken. Gaps are not numbered: a trip photographed on
 * the 14th and the 16th is two days, not three.
 */
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
    .map((key, index) => ({ key, number: index + 1, photos: days.get(key)! }));
  if (undated.length) grouped.push({ key: null, number: null, photos: undated });
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

/** The trip days a post already has sections for. */
export function laidOutDays(blocks: Block[]): Set<string> {
  const days = new Set<string>();
  for (const block of blocks) {
    if (block.type === 'section' && block.tripDate) days.add(block.tripDate);
  }
  return days;
}

export interface DayLayout {
  blocks: Block[];
  days: number;
  photos: number;
}

/**
 * The skeleton for every tray day the post has no section for yet: a numbered
 * section per day, then for each category present that day a text block to fill
 * in and the photos it is about. The writer gets the structure and the photos
 * in place and only has to add the words.
 */
export function layoutMissingDays(photos: TrayPhoto[], blocks: Block[]): DayLayout {
  const done = laidOutDays(blocks);
  const out: Block[] = [];
  let days = 0;
  let count = 0;

  for (const day of groupByDay(photos)) {
    if (!day.key || done.has(day.key)) continue;
    days += 1;
    count += day.photos.length;

    out.push({
      id: newBlockId(),
      type: 'section',
      numbered: true,
      label: '',
      title: '',
      date: formatDayKey(day.key),
      place: '',
      tripDate: day.key,
    });

    for (const group of groupByCategory(day.photos)) {
      const category = POST_CATEGORIES.find((entry) => entry.id === group.id);
      out.push({
        id: newBlockId(),
        type: 'text',
        body: emptyRichText(),
        tag: category?.label ?? 'Untagged',
      });
      out.push({
        id: newBlockId(),
        type: 'photos',
        items: group.photos.map((photo) => ({ kind: 'journal', id: photo.id })),
        layout: autoLayout(group.photos.length),
        size: 'column',
        caption: '',
      });
    }
  }

  return { blocks: out, days, photos: count };
}

/**
 * Where laid-out days go: after the last day already in the post and whatever
 * belongs to it, so a closing section like "Packing" stays at the end. With no
 * days yet, at the end.
 */
export function insertionPointForDays(blocks: Block[]): number {
  let lastDay = -1;
  blocks.forEach((block, index) => {
    if (block.type === 'section' && block.numbered) lastDay = index;
  });
  if (lastDay < 0) return blocks.length;
  const next = blocks.findIndex((block, index) => index > lastDay && block.type === 'section');
  return next < 0 ? blocks.length : next;
}

/** The placeholder a tray-made text block shows, by its category tag. */
export function promptForTag(tag: string | undefined): string | null {
  if (!tag) return null;
  return POST_CATEGORIES.find((category) => category.label === tag)?.prompt ?? 'Write about the rest of the day…';
}
