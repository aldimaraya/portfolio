import { z } from 'zod';
import { photoSettingsSchema } from '@/lib/photo/settings';
import { youtubeId } from '@/lib/markdown/media';
import { formatTagNames, parseTagNames } from '@/lib/tags/parse';

/**
 * The Add media queue's rules, apart from its markup and its actions, so the
 * client's "what is still missing" and the server's publish check are one
 * definition rather than two that can drift.
 *
 * A draft is a Photo or Video row with `draft: true` — uploaded, saved, but off
 * the site. Drafts are written leniently, because a batch is uploaded before it
 * is described: a row with no place yet is a normal state, not an error. The
 * line savePhotoDetails and saveVideo hold on every write is held here once, at
 * publish (`publishProblems`).
 */

export type MediaKind = 'still' | 'clip';

/** What a person types about a still in the queue. Everything else is derived. */
export const stillFieldsSchema = z.object({
  title: z.string().trim(),
  location: z.string().trim(),
  camera: z.string().trim(),
  // A date input's "yyyy-mm-dd", or '' for unknown — see lib/photo/date.
  takenAt: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'That is not a date')]),
  settings: photoSettingsSchema,
  tags: z.string(),
});

export type StillFields = z.infer<typeof stillFieldsSchema>;

export const clipFieldsSchema = z.object({
  title: z.string().trim(),
  description: z.string().trim(),
  // Empty while a draft is being described; checked at publish.
  rollId: z.string(),
  // The pasted link, kept as typed so the field shows what was pasted. Reduced
  // to its id on the way into the row — see youtubeIdOf.
  youtubeUrl: z.string().trim(),
  tags: z.string(),
});

export type ClipFields = z.infer<typeof clipFieldsSchema>;

/** The derived half of a new still, measured in the browser at upload. */
export const stillUploadSchema = z.object({
  imageUrl: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  avgHue: z.number(),
  avgChroma: z.number(),
  avgLightness: z.number(),
  warmth: z.number(),
  isMonochrome: z.boolean(),
});

export const clipUploadSchema = z.object({
  videoUrl: z.url(),
  posterImageUrl: z.url(),
  spriteUrl: z.url(),
  spriteFrames: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().nonnegative(),
});

/**
 * A pasted YouTube link → the stored id, '' for none, null for a link that is
 * not to a YouTube video. Same reading as saveVideo's: a scheme-less youtu.be/ID
 * is given one, since URL() will not parse it otherwise.
 */
export function youtubeIdOf(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return youtubeId(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
}

/**
 * Why a draft cannot be published yet, phrased to finish "Needs …". Mirrors
 * the required fields of the photo and video schemas. A missing date is not here:
 * it is worth a warning (see needsDate) but most of the library has none, and
 * holding a batch back over it would only train the admin to type in guesses.
 */
export function publishProblems(
  item: { kind: 'still'; fields: Pick<StillFields, 'location' | 'camera'> } | {
    kind: 'clip';
    fields: Pick<ClipFields, 'title' | 'rollId' | 'youtubeUrl'>;
  },
): string[] {
  const problems: string[] = [];
  if (item.kind === 'still') {
    if (!item.fields.location.trim()) problems.push('a place');
    if (!item.fields.camera.trim()) problems.push('a camera');
  } else {
    if (!item.fields.title.trim()) problems.push('a title');
    if (!item.fields.rollId) problems.push('a roll');
    if (youtubeIdOf(item.fields.youtubeUrl) === null) problems.push('a YouTube link that works');
  }
  return problems;
}

/** A still with no capture date: publishable, but flagged, since EXIF is the only chance to get one free. */
export function needsDate(item: { kind: MediaKind; fields: StillFields | ClipFields }): boolean {
  return item.kind === 'still' && !(item.fields as StillFields).takenAt;
}

/**
 * Where an item is. Two phases: processing, on pick, entirely in the browser —
 * `queued` to `ready`, with the result kept in IndexedDB — and publishing,
 * which is the only time anything is sent: `uploading` and `saving`. `ready`
 * covers both an item processed in this browser and a draft row already
 * uploaded by an earlier publish that did not finish.
 */
export type Stage = 'queued' | 'reading' | 'encoding' | 'framing' | 'ready' | 'uploading' | 'saving' | 'failed';

/** Something is running for it in this tab — what a refresh would interrupt. */
export function inFlight(stage: Stage): boolean {
  return stage !== 'ready' && stage !== 'failed';
}

/** Running, and the running part is a transfer to R2 rather than local work. */
export function sending(stage: Stage): boolean {
  return stage === 'uploading' || stage === 'saving';
}

export interface QueueTally {
  ready: number;
  inProgress: number;
  failed: number;
  /** Ready, but holding up a publish until something is typed in. */
  blocked: number;
  undated: number;
}

export function tallyQueue(
  items: { kind: MediaKind; stage: Stage; fields: StillFields | ClipFields }[],
): QueueTally {
  const tally: QueueTally = { ready: 0, inProgress: 0, failed: 0, blocked: 0, undated: 0 };
  for (const item of items) {
    if (item.stage === 'failed') tally.failed += 1;
    else if (inFlight(item.stage)) tally.inProgress += 1;
    else if (problemsOf(item).length) tally.blocked += 1;
    else tally.ready += 1;
    if (item.stage !== 'failed' && needsDate(item)) {
      tally.undated += 1;
    }
  }
  return tally;
}

/** publishProblems for a queue item whose kind and fields are only known to agree at runtime. */
export function problemsOf(item: { kind: MediaKind; fields: StillFields | ClipFields }): string[] {
  return item.kind === 'still'
    ? publishProblems({ kind: 'still', fields: item.fields as StillFields })
    : publishProblems({ kind: 'clip', fields: item.fields as ClipFields });
}

/**
 * How far one item is through the phase it is in, 0–100. Each stage reports its
 * own 0–100, so the stages of a phase are laid end to end here — weighted by
 * roughly how long they take — or the figure would fall back to 0 every time
 * one finished. A clip's encode is most of its processing.
 */
const SPANS: Record<MediaKind, Partial<Record<Stage, [number, number]>>> = {
  still: { reading: [0, 100], uploading: [0, 95], saving: [95, 100] },
  clip: { reading: [0, 5], encoding: [5, 85], framing: [85, 100], uploading: [0, 95], saving: [95, 100] },
};

export function itemPercent(kind: MediaKind, stage: Stage, progress: number): number {
  if (stage === 'ready') return 100;
  const span = SPANS[kind][stage];
  if (!span) return 0;
  const [from, to] = span;
  return Math.round(from + ((to - from) * Math.min(100, Math.max(0, progress))) / 100);
}

/**
 * One number for what is running, for the sidebar's button: the mean of the
 * items in flight. Null when nothing is.
 */
export function queueProgress(items: { kind: MediaKind; stage: Stage; progress: number }[]): number | null {
  const running = items.filter((item) => inFlight(item.stage));
  if (!running.length) return null;
  const sum = running.reduce((total, item) => total + itemPercent(item.kind, item.stage, item.progress), 0);
  return Math.round(sum / running.length);
}

/**
 * What a picked file is, by its type and then its extension: a drag from
 * Finder can arrive with an empty type for formats the OS does not register,
 * and a .mov from a camera card is still a clip.
 */
export function kindOfFile(file: { name: string; type: string }): MediaKind | null {
  if (file.type.startsWith('image/')) return 'still';
  if (file.type.startsWith('video/')) return 'clip';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif', 'tif', 'tiff'].includes(extension)) return 'still';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(extension)) return 'clip';
  return null;
}

/**
 * Applies the bulk bar to one item's fields. Only what was typed is applied —
 * a blank Place leaves each photo's own place alone — and tags are added to
 * what an item already has rather than replacing it, so tagging a batch "night"
 * does not strip the "street" one photo was given by hand.
 */
export function applyBulk<F extends StillFields | ClipFields>(
  kind: MediaKind,
  fields: F,
  bulk: { location: string; camera: string; tags: string; rollId: string },
): F {
  const next = { ...fields };
  if (kind === 'still') {
    const still = next as StillFields;
    if (bulk.location.trim()) still.location = bulk.location.trim();
    if (bulk.camera.trim()) still.camera = bulk.camera.trim();
  } else if (bulk.rollId) {
    (next as ClipFields).rollId = bulk.rollId;
  }
  // Through parse again, which is what dedupes — format alone would repeat a
  // tag the item already had.
  if (parseTagNames(bulk.tags).length) next.tags = formatTagNames(parseTagNames(`${fields.tags},${bulk.tags}`));
  return next;
}
