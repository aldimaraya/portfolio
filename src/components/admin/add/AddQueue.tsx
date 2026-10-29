'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { analyzePixels } from '@/lib/color/analyze';
import { hasBorder, type BorderInsets } from '@/lib/photo/border';
import { decodeImage, detectBorder, prepareUpload } from '@/lib/photo/trim-client';
import { extractPhotoExif } from '@/lib/photo/exif';
import { exifCapturedAtToInputValue } from '@/lib/photo/date';
import { EMPTY_SETTINGS, settingsFromExif, type PhotoSettings } from '@/lib/photo/settings';
import { encodedFilename } from '@/lib/photo/compress';
import { uploadFile } from '@/lib/storage/upload-client';
import { generateSpriteSheet } from '@/lib/video/sprite';
import { prepareCover } from '@/lib/video/cover-client';
import { inspectAudio } from '@/lib/video/audio';
import { titleFromFilename } from '@/lib/video/form';
import { formatMbps, formatMegabytes, estimatedBitrate, shouldTranscode, type TranscodePlan } from '@/lib/video/transcode';
import { canTranscodeHere, isCancellation, probeVideo, transcodeVideo } from '@/lib/video/transcode-client';
import {
  inFlight,
  kindOfFile,
  problemsOf,
  queueProgress,
  sending,
  type ClipFields,
  type Stage,
  type StillFields,
} from '@/lib/admin/drafts';
import type { DraftRow } from '@/lib/admin/load-drafts';
import {
  forgetItem,
  loadFiles,
  loadItems,
  storageError,
  storeDetails,
  storeFiles,
  storeItem,
  type StoredFiles,
  type StoredItem,
} from '@/lib/admin/queue-store';
import {
  createDraftClip,
  createDraftStill,
  discardDraft,
  publishDrafts,
  saveDraftClip,
  saveDraftStill,
} from '@/app/admin/add/actions';

interface ItemBase {
  /** Stable for the item's life; an uploaded draft's is its row id. */
  key: string;
  /**
   * The draft row, for an item a publish uploaded but could not put live.
   * Without one the item exists only in this browser, and R2 has never seen it.
   */
  id?: string;
  name: string;
  /** When it was added, which orders the queue after a reload. */
  added: number;
  stage: Stage;
  /** Of the current stage, 0–100. */
  progress: number;
  /** What happened to the file — sizes, the encode — shown under its name. */
  note: string;
  /** Advisory, never blocking: an audio track browsers will not play, say. */
  warning: string;
  /** Why it failed, or why its last save or publish was refused. */
  error: string;
  thumb: string;
  width: number;
  height: number;
  selected: boolean;
  /** The fields as last written — to IndexedDB or to the row — as JSON; differing means a write is due. */
  saved: string;
  saving: boolean;
}

export type StillItem = ItemBase & {
  kind: 'still';
  fields: StillFields;
  /** The border cut from the original, null when none was. Only known for an item processed here. */
  insets: BorderInsets | null;
  /** The stored copy, for an uploaded draft. */
  imageUrl: string;
};

export type ClipItem = ItemBase & {
  kind: 'clip';
  fields: ClipFields;
  durationSeconds: number;
  /** Where the preview frames come from. Null for an uploaded draft, whose frames are fixed. */
  window: { start: number; seconds: number } | null;
  /** A hand-picked thumbnail is standing in for the grabbed poster. */
  hasCover: boolean;
};

export type QueueItem = StillItem | ClipItem;

type Fields<K extends QueueItem['kind']> = K extends 'still' ? StillFields : ClipFields;

interface AddQueue {
  items: QueueItem[];
  /** False until the browser's copy of the queue has been read back. */
  restored: boolean;
  /** `rollId` is where new clips start — the first roll, as the old form offered. */
  addFiles: (files: Iterable<File>, defaults?: { rollId?: string }) => void;
  /** Takes in the uploaded drafts the page read from the database, skipping any already held. */
  adopt: (rows: DraftRow[]) => void;
  edit: <K extends QueueItem['kind']>(key: string, kind: K, patch: Partial<Fields<K>>) => void;
  editMany: (keys: string[], change: (item: QueueItem) => StillFields | ClipFields) => void;
  select: (keys: string[], selected: boolean) => void;
  /** Drops an item: stops its processing, forgets its local copy, or discards its draft row and files. */
  remove: (key: string) => Promise<void>;
  retry: (key: string) => void;
  /** The original a still was cut from, for a trim review. Only for one processed here. */
  original: (key: string) => File | undefined;
  /** Re-cuts a local still from its original with new insets. */
  retrim: (key: string, insets: BorderInsets) => Promise<string | null>;
  /** A local clip's file and frame strip, for the preview picker. */
  clipSource: (key: string) => { file: File; sprite: Blob } | undefined;
  /** Re-grabs a local clip's preview frames from a new point; resolves to an error, or null. */
  regrab: (key: string, startSeconds?: number) => Promise<string | null>;
  /** Sets a local clip's hand-picked thumbnail, or clears it with null. */
  setCover: (key: string, picked: File | null) => Promise<string | null>;
  /** After a trim review has replaced an uploaded draft's stored file. */
  retouched: (key: string, image: { imageUrl: string; width: number; height: number }) => void;
  publish: () => Promise<{ published: number; refused: number } | { error: string }>;
  publishing: boolean;
}

const Context = createContext<AddQueue | null>(null);

export function useAddQueue(): AddQueue {
  const queue = useContext(Context);
  if (!queue) throw new Error('useAddQueue needs an <AddQueueProvider> above it');
  return queue;
}

/** For an uploaded draft's server autosave: long enough to cover a word being typed. */
const AUTOSAVE_MS = 700;

let nextKey = 0;

function emptyStillFields(): StillFields {
  return { title: '', location: '', camera: '', takenAt: '', settings: EMPTY_SETTINGS, tags: '' };
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

type Colour = Extract<StoredItem, { kind: 'still' }>['colour'];

/**
 * What IndexedDB holds for an item, beyond its files. Built from the item in
 * state plus what only processing knows (colour, frame count), which is kept
 * in a ref rather than state since nothing on screen draws it.
 */
function toStored(item: QueueItem, extra: { colour?: Colour; spriteFrames?: number }): StoredItem {
  const base = {
    key: item.key,
    name: item.name,
    added: item.added,
    note: item.note,
    warning: item.warning,
    width: item.width,
    height: item.height,
    selected: item.selected,
  };
  return item.kind === 'still'
    ? { ...base, kind: 'still', fields: item.fields, insets: item.insets, colour: extra.colour! }
    : {
        ...base,
        kind: 'clip',
        fields: item.fields,
        durationSeconds: item.durationSeconds,
        spriteFrames: extra.spriteFrames ?? 0,
        windowStart: item.window?.start,
        windowSeconds: item.window?.seconds,
      };
}

/**
 * The Add media queue. Picking a file processes it at once, in the browser —
 * EXIF, border, re-encode and colour for a still; probe, 1080p encode and
 * frame grab for a clip — and keeps the result in IndexedDB. **Nothing is
 * uploaded until Publish**, so removing a file picked by mistake costs no R2
 * storage or operations, and a refresh loses only what was still processing.
 *
 * Publish uploads each chosen item and writes it as a hidden draft row, then
 * puts the whole batch live in one step. An item uploaded by a publish that
 * then failed, or was cut off, stays a draft row: the page hands those back
 * (`adopt`) and they publish without uploading again.
 *
 * Held in the admin layout, so processing and publishing carry on while the
 * admin moves to another page; the sidebar button shows how far they have got.
 * Two lanes, one item at a time each — stills and clips — because a decoded
 * 24 MP frame is ~100 MB and an encode holds its whole output in memory, and so
 * a ten-minute encode does not hold up the photos picked with it.
 */
export function AddQueueProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [restored, setRestored] = useState(false);
  // The same list, readable from inside a pipeline that is minutes into an
  // await and would otherwise see the state it started with.
  const itemsRef = useRef<QueueItem[]>([]);
  /** Picked files waiting for, or going through, processing. */
  const picked = useRef(new Map<string, File>());
  /** Processed files, as IndexedDB holds them; what Publish uploads. */
  const files = useRef(new Map<string, StoredFiles>());
  /** Colour stats and frame counts: stored with the item, never drawn. */
  const extras = useRef(new Map<string, { colour?: Colour; spriteFrames?: number }>());
  const lanes = useRef({ still: [] as string[], clip: [] as string[] });
  const running = useRef({ still: false, clip: false });
  const aborts = useRef(new Map<string, AbortController>());
  /** Object URLs per item, revoked when it goes so a batch of previews is not pinned in memory. */
  const urls = useRef(new Map<string, string[]>());
  /** Draft rows published or discarded here, which a stale page render must not bring back. */
  const gone = useRef(new Set<string>());
  const [publishing, setPublishing] = useState(false);

  // Applied to the ref at once, then handed to React — not the other way
  // round. React may run a state updater only at the next render, so a ref set
  // from inside one lags: a pipeline that patched an item and then read it back
  // got the item from before the patch, and stored clips without their length,
  // size or frame window.
  const update = useCallback((change: (prev: QueueItem[]) => QueueItem[]) => {
    const next = change(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (key: string, change: Partial<QueueItem> | ((item: QueueItem) => Partial<QueueItem>)) => {
      update((prev) =>
        prev.map((item) =>
          item.key === key ? ({ ...item, ...(typeof change === 'function' ? change(item) : change) } as QueueItem) : item,
        ),
      );
    },
    [update],
  );

  const current = (key: string) => itemsRef.current.find((item) => item.key === key);
  const alive = (key: string) => Boolean(current(key));

  const objectUrl = useCallback((key: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.set(key, [...(urls.current.get(key) ?? []), url]);
    return url;
  }, []);

  const forget = useCallback((key: string) => {
    for (const url of urls.current.get(key) ?? []) URL.revokeObjectURL(url);
    urls.current.delete(key);
    picked.current.delete(key);
    files.current.delete(key);
    extras.current.delete(key);
    aborts.current.get(key)?.abort();
    aborts.current.delete(key);
  }, []);

  const fail = (key: string, error: string) => patch(key, { stage: 'failed', progress: 0, error });

  // ── Restoring ─────────────────────────────────────────────────────────────
  // What was processed before a refresh. The files stay on disk: each is a
  // disk-backed Blob until something reads it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadItems();
        const restoredItems: QueueItem[] = [];
        for (const entry of stored) {
          const kept = await loadFiles(entry.key);
          // Details without files is a write that never committed; nothing to publish.
          if (!kept) {
            await forgetItem(entry.key);
            continue;
          }
          if (cancelled) return;
          files.current.set(entry.key, kept);
          extras.current.set(
            entry.key,
            entry.kind === 'still' ? { colour: entry.colour } : { spriteFrames: entry.spriteFrames },
          );
          const base = {
            key: entry.key,
            name: entry.name,
            added: entry.added,
            stage: 'ready' as const,
            progress: 100,
            note: entry.note,
            warning: entry.warning,
            error: '',
            thumb: objectUrl(entry.key, entry.kind === 'still' ? kept.upload : (kept.cover ?? kept.poster ?? kept.upload)),
            width: entry.width,
            height: entry.height,
            selected: entry.selected,
            saved: JSON.stringify(entry.fields),
            saving: false,
          };
          restoredItems.push(
            entry.kind === 'still'
              ? { ...base, kind: 'still', fields: entry.fields, insets: entry.insets, imageUrl: '' }
              : {
                  ...base,
                  kind: 'clip',
                  fields: entry.fields,
                  durationSeconds: entry.durationSeconds,
                  window:
                    entry.windowStart === undefined
                      ? null
                      : { start: entry.windowStart, seconds: entry.windowSeconds ?? 0 },
                  hasCover: Boolean(kept.cover),
                },
          );
        }
        if (cancelled) return;
        // Ahead of anything picked while this was reading: those were added later.
        update((prev) => [...restoredItems, ...prev.filter((item) => !restoredItems.some((r) => r.key === item.key))]);
      } catch (cause) {
        // A private window, or storage switched off: the queue still works, it
        // just does not survive a refresh.
        console.error('Could not restore the Add media queue', cause);
      } finally {
        if (!cancelled) setRestored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [objectUrl, update]);

  /**
   * Writes a processed item to IndexedDB and marks it ready. `saved` is the
   * fields as they were written, so anything typed during the write still
   * differs and is written after it. A refusal is said on the row: the item
   * stays publishable from memory while this tab lives, just not past a refresh.
   */
  async function keep(key: string, kept: StoredFiles) {
    const item = current(key);
    if (!item) return;
    const json = JSON.stringify(item.fields);
    try {
      await storeItem(toStored(item, extras.current.get(key) ?? {}), kept);
      // The copy read back is disk-backed; the one in hand may be a whole
      // encode held in memory.
      files.current.set(key, (await loadFiles(key)) ?? kept);
      patch(key, { stage: 'ready', progress: 100, saved: json });
    } catch (cause) {
      files.current.set(key, kept);
      patch(key, { stage: 'ready', progress: 100, saved: json, warning: storageError(cause) });
    }
    picked.current.delete(key);
  }

  /**
   * A picked photo, processed: EXIF off the original before anything strips
   * it, the border found and cut, the re-encode, and colour from the cropped
   * pixels. The same steps the one-at-a-time form ran, minus the upload.
   */
  async function runStill(key: string, file: File) {
    patch(key, { stage: 'reading', progress: 0, error: '' });
    let bitmap: ImageBitmap | null = null;
    try {
      const [decoded, exif] = await Promise.all([decodeImage(file), extractPhotoExif(file)]);
      bitmap = decoded;
      if (!alive(key)) return;

      const insets = detectBorder(decoded);
      // Never keeps the original bytes when they carry EXIF — that is the GPS.
      const prepared = await prepareUpload(decoded, insets, file, exif.hasExif);
      const colour = analyzePixels(prepared.pixels);
      if (!alive(key)) return;
      extras.current.set(key, { colour });

      const thumb = objectUrl(key, prepared.file);
      patch(key, (item) => {
        const fields = item.fields as StillFields;
        // Only blanks are filled: anything typed while the file was read stays.
        const fromExif = settingsFromExif(exif);
        const settings = { ...fields.settings };
        for (const name of Object.keys(fromExif) as (keyof PhotoSettings)[]) {
          if (!settings[name] && fromExif[name]) settings[name] = fromExif[name];
        }
        return {
          thumb,
          width: prepared.width,
          height: prepared.height,
          note: `${formatMegabytes(file.size)} → ${formatMegabytes(prepared.file.size)} · ${prepared.width}×${prepared.height}`,
          insets: hasBorder(insets) ? insets : null,
          fields: {
            ...fields,
            camera: fields.camera || exif.camera || '',
            takenAt: fields.takenAt || (exif.capturedAt ? exifCapturedAtToInputValue(exif.capturedAt) : ''),
            settings,
          },
        } as Partial<StillItem>;
      });
      bitmap.close();
      bitmap = null;

      await keep(key, { key, upload: prepared.file, original: file });
    } catch (cause) {
      if (alive(key)) fail(key, message(cause, 'Could not read that image'));
    } finally {
      bitmap?.close();
    }
  }

  /**
   * A picked clip, processed: sized up, re-encoded if it is over target
   * (desktop only), and frames grabbed from what will actually be uploaded.
   * Any encode failure falls back to the original, as the old form did;
   * Remove mid-encode aborts it.
   */
  async function runClip(key: string, file: File) {
    patch(key, { stage: 'reading', progress: 0, error: '', warning: '' });
    try {
      const audioProblem = inspectAudio(file);
      let upload = file;
      let plan: TranscodePlan | null = null;
      let note = '';

      if (canTranscodeHere()) {
        const probe = await probeVideo(file).catch(() => null);
        if (!alive(key)) return;
        if (!probe) note = 'Could not size this clip up — it will upload as-is.';
        else if (!probe.canDecode) note = 'This browser cannot decode it — it will upload as-is. Encode masters to H.264 first.';
        else {
          const rate = formatMbps(estimatedBitrate(file.size, probe.durationSeconds));
          const found = `${formatMegabytes(file.size)} · ${probe.width}×${probe.height}${rate ? ` · ${rate}` : ''}`;
          plan = shouldTranscode({
            bytes: file.size,
            durationSeconds: probe.durationSeconds,
            width: probe.width,
            height: probe.height,
            audioCodec: probe.audioCodec,
            audioBitrate: probe.audioBitrate,
          });
          note = plan ? found : `${found} · within target, kept as-is`;
        }

        if (plan) {
          const controller = new AbortController();
          aborts.current.set(key, controller);
          patch(key, { stage: 'encoding', progress: 0, note });
          try {
            const encoded = await transcodeVideo(file, plan, {
              signal: controller.signal,
              onProgress: (fraction) => patch(key, { progress: Math.round(fraction * 100) }),
            });
            upload = encoded;
            note =
              encoded === file
                ? `${note} · re-encoding saved nothing, kept the original`
                : `${formatMegabytes(file.size)} → ${formatMegabytes(encoded.size)} · ${plan.width}×${plan.height}`;
          } catch (cause) {
            // Only Remove cancels, and Remove has already taken the item away.
            if (isCancellation(cause) || !alive(key)) return;
            note = `Could not re-encode (${message(cause, 'unknown error')}) — it will upload as-is.`;
          } finally {
            aborts.current.delete(key);
          }
        }
      } else {
        note = `${formatMegabytes(file.size)} · as shot — the 1080p re-encode only runs on a computer`;
      }
      if (!alive(key)) return;

      // An encode that re-encoded the audio has already fixed what this warns about.
      const warning = plan?.fixesAudio && upload !== file ? '' : ((await audioProblem) ?? '');
      patch(key, { stage: 'framing', progress: 0, note, warning });

      const sprite = await generateSpriteSheet(upload, {
        onProgress: (step) => patch(key, { progress: step.percent }),
      });
      if (!alive(key)) return;
      extras.current.set(key, { spriteFrames: sprite.frameCount });
      const thumb = objectUrl(key, sprite.posterBlob);
      patch(key, {
        thumb,
        width: sprite.videoWidth,
        height: sprite.videoHeight,
        durationSeconds: sprite.durationSeconds,
        window: { start: sprite.startSeconds, seconds: sprite.windowSeconds },
      } as Partial<ClipItem>);

      await keep(key, { key, upload, poster: sprite.posterBlob, sprite: sprite.spriteBlob });
    } catch (cause) {
      if (alive(key)) fail(key, message(cause, 'Could not process that clip'));
    }
  }

  async function drain(kind: 'still' | 'clip') {
    if (running.current[kind]) return;
    running.current[kind] = true;
    try {
      for (let key = lanes.current[kind].shift(); key; key = lanes.current[kind].shift()) {
        const file = picked.current.get(key);
        if (!file || !alive(key)) continue;
        await (kind === 'still' ? runStill(key, file) : runClip(key, file));
      }
    } finally {
      running.current[kind] = false;
    }
  }

  function enqueue(key: string, kind: 'still' | 'clip') {
    lanes.current[kind].push(key);
    void drain(kind);
  }

  const addFiles: AddQueue['addFiles'] = (chosen, defaults = {}) => {
    const added: QueueItem[] = [];
    for (const file of chosen) {
      const kind = kindOfFile(file);
      if (!kind) continue;
      // Unique across reloads too: restored items keep the keys they were stored under.
      const key = `local-${Date.now().toString(36)}-${(nextKey += 1)}`;
      picked.current.set(key, file);
      const base = {
        key,
        name: file.name,
        added: Date.now(),
        stage: 'queued' as const,
        progress: 0,
        note: formatMegabytes(file.size),
        warning: '',
        error: '',
        thumb: '',
        width: 0,
        height: 0,
        selected: true,
        saved: '',
        saving: false,
      };
      added.push(
        kind === 'still'
          ? { ...base, kind, fields: emptyStillFields(), insets: null, imageUrl: '' }
          : {
              ...base,
              kind,
              durationSeconds: 0,
              window: null,
              hasCover: false,
              // The filename as a starting title, as the old form offered.
              fields: {
                title: titleFromFilename(file.name),
                description: '',
                rollId: defaults.rollId ?? '',
                youtubeUrl: '',
                tags: '',
              },
            },
      );
    }
    if (!added.length) return;
    update((prev) => [...prev, ...added]);
    for (const item of added) enqueue(item.key, item.kind);
  };

  const adopt = useCallback(
    (rows: DraftRow[]) => {
      update((prev) => {
        const held = new Set(prev.map((item) => item.id));
        const adopted = rows
          .filter((row) => !held.has(row.id) && !gone.current.has(row.id))
          .map((row): QueueItem => {
            const base = {
              key: row.id,
              id: row.id,
              name: row.name,
              added: 0,
              stage: 'ready' as const,
              progress: 100,
              note: row.width ? `${row.width}×${row.height}` : '',
              warning: '',
              error: '',
              thumb: row.thumb,
              width: row.width,
              height: row.height,
              selected: true,
              saved: JSON.stringify(row.fields),
              saving: false,
            };
            return row.kind === 'still'
              ? { ...base, kind: 'still', fields: row.fields, insets: null, imageUrl: row.thumb }
              : {
                  ...base,
                  kind: 'clip',
                  fields: row.fields,
                  durationSeconds: row.durationSeconds,
                  window: null,
                  hasCover: false,
                };
          });
        return adopted.length ? [...adopted, ...prev] : prev;
      });
    },
    [update],
  );

  const edit: AddQueue['edit'] = (key, kind, change) =>
    patch(key, (item) => (item.kind === kind ? { fields: { ...item.fields, ...change } } : {}) as Partial<QueueItem>);

  const editMany: AddQueue['editMany'] = (keys, change) => {
    const chosen = new Set(keys);
    update((prev) =>
      prev.map((item) => (chosen.has(item.key) ? ({ ...item, fields: change(item) } as QueueItem) : item)),
    );
  };

  const select = (keys: string[], selected: boolean) => {
    const chosen = new Set(keys);
    update((prev) => prev.map((item) => (chosen.has(item.key) ? { ...item, selected } : item)));
    // A selection is cheap to lose, but kept with the details so a reload
    // does not silently re-select a batch held back on purpose.
    for (const item of itemsRef.current) {
      if (chosen.has(item.key) && !item.id && item.stage === 'ready') {
        void storeDetails(toStored({ ...item, selected }, extras.current.get(item.key) ?? {})).catch(() => undefined);
      }
    }
  };

  // ── Saving edits ──────────────────────────────────────────────────────────
  // A local item's fields go straight to IndexedDB on every change: the write
  // is small, and a debounce would lose the last word typed before a refresh.
  // An uploaded draft's go to its row, debounced, as the Stills inspector does.
  const timers = useRef(new Map<string, { json: string; timer: ReturnType<typeof setTimeout> }>());
  /** The fields each local item is being written with, so a re-render mid-write does not write again. */
  const writing = useRef(new Map<string, string>());

  const flush = useCallback(
    async (key: string) => {
      timers.current.delete(key);
      const item = itemsRef.current.find((entry) => entry.key === key);
      if (!item?.id || item.stage !== 'ready') return;
      const json = JSON.stringify(item.fields);
      if (json === item.saved) return;
      patch(key, { saving: true });
      // Server actions from one client run one at a time, so an older save
      // cannot land after a newer one.
      const result =
        item.kind === 'still'
          ? await saveDraftStill(item.id, item.fields)
          : await saveDraftClip(item.id, item.fields);
      patch(key, result.error !== undefined ? { saving: false, error: result.error } : { saving: false, error: '', saved: json });
    },
    [patch],
  );

  useEffect(() => {
    for (const item of items) {
      if (item.stage !== 'ready') continue;
      const json = JSON.stringify(item.fields);
      if (json === item.saved) continue;

      if (!item.id) {
        if (writing.current.get(item.key) === json) continue;
        writing.current.set(item.key, json);
        storeDetails(toStored(item, extras.current.get(item.key) ?? {}))
          .then(
            () => patch(item.key, { saved: json }),
            (cause) => patch(item.key, { saved: json, warning: storageError(cause) }),
          )
          .finally(() => {
            if (writing.current.get(item.key) === json) writing.current.delete(item.key);
          });
        continue;
      }

      const pending = timers.current.get(item.key);
      // Re-armed only by an edit, not by every progress tick elsewhere in the
      // queue — which would otherwise hold a save off for as long as anything
      // is processing.
      if (pending?.json === json) continue;
      if (pending) clearTimeout(pending.timer);
      timers.current.set(item.key, { json, timer: setTimeout(() => void flush(item.key), AUTOSAVE_MS) });
    }
  }, [items, flush, patch]);

  // ── Leaving ───────────────────────────────────────────────────────────────
  // Only work in progress is at risk: anything finished is on disk.
  const unsafe = items.some((item) => inFlight(item.stage) || (item.id && JSON.stringify(item.fields) !== item.saved));
  useEffect(() => {
    if (!unsafe) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsafe]);

  // Leaving the admin altogether unmounts this; stop encodes and free previews.
  useEffect(
    () => () => {
      for (const key of urls.current.keys()) forget(key);
      for (const controller of aborts.current.values()) controller.abort();
    },
    [forget],
  );

  const remove = async (key: string) => {
    const item = current(key);
    // Mid-upload there is nothing to cancel: uploadFile cannot be stopped, and
    // the draft it is about to write is better discarded once it exists.
    if (!item || sending(item.stage)) return;
    if (item.id) {
      patch(key, { saving: true });
      const result = await discardDraft(item.kind, item.id);
      if (result.error !== undefined) return patch(key, { saving: false, error: result.error });
      gone.current.add(item.id);
      router.refresh();
    } else {
      await forgetItem(key).catch(() => undefined);
    }
    forget(key);
    update((prev) => prev.filter((entry) => entry.key !== key));
  };

  const retry = (key: string) => {
    const item = current(key);
    if (!item || item.stage !== 'failed' || !picked.current.has(key)) return;
    patch(key, { stage: 'queued', error: '', progress: 0 });
    enqueue(key, item.kind);
  };

  const original = (key: string) => files.current.get(key)?.original;

  const retrim: AddQueue['retrim'] = async (key, insets) => {
    const kept = files.current.get(key);
    const item = current(key);
    if (!kept?.original || item?.kind !== 'still') return 'The original is no longer here';
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await decodeImage(kept.original);
      // Always re-encoded: the original carries EXIF, and keeping its bytes
      // would publish the GPS in it.
      const prepared = await prepareUpload(bitmap, insets, kept.original, true);
      const colour = analyzePixels(prepared.pixels);
      const next = { ...kept, upload: prepared.file };
      extras.current.set(key, { colour });
      const thumb = objectUrl(key, prepared.file);
      const updated: StillItem = {
        ...item,
        thumb,
        width: prepared.width,
        height: prepared.height,
        insets: hasBorder(insets) ? insets : null,
        note: `${formatMegabytes(kept.original.size)} → ${formatMegabytes(prepared.file.size)} · ${prepared.width}×${prepared.height}`,
      };
      patch(key, updated);
      await storeFiles(next);
      await storeDetails(toStored(updated, { colour }));
      files.current.set(key, (await loadFiles(key)) ?? next);
      return null;
    } catch (cause) {
      return message(cause, 'Could not re-cut the photo');
    } finally {
      bitmap?.close();
    }
  };

  const clipSource: AddQueue['clipSource'] = (key) => {
    const kept = files.current.get(key);
    return kept?.sprite ? { file: kept.upload, sprite: kept.sprite } : undefined;
  };

  /**
   * Swaps a local clip's files and redraws its row. Written to IndexedDB with
   * the item, then read back so the copy held is disk-backed.
   */
  async function replaceClipFiles(key: string, next: StoredFiles, change: Partial<ClipItem>) {
    const item = current(key);
    if (item?.kind !== 'clip') return;
    const thumb = objectUrl(key, next.cover ?? next.poster ?? next.upload);
    const updated = { ...item, ...change, thumb } as ClipItem;
    // Files first: the patch re-renders the preview panel, which reads its
    // strip from here — set after, it would redraw with the old one.
    files.current.set(key, next);
    patch(key, updated);
    await storeFiles(next);
    await storeDetails(toStored(updated, extras.current.get(key) ?? {}));
    files.current.set(key, (await loadFiles(key)) ?? next);
  }

  const regrab: AddQueue['regrab'] = async (key, startSeconds) => {
    const kept = files.current.get(key);
    if (!kept) return 'The clip is no longer here';
    try {
      const sprite = await generateSpriteSheet(kept.upload, { startSeconds });
      extras.current.set(key, { spriteFrames: sprite.frameCount });
      await replaceClipFiles(
        key,
        { ...kept, poster: sprite.posterBlob, sprite: sprite.spriteBlob },
        {
          window: { start: sprite.startSeconds, seconds: sprite.windowSeconds },
          // Re-read with the frames, which is what repairs an item stored without them.
          durationSeconds: sprite.durationSeconds,
          width: sprite.videoWidth,
          height: sprite.videoHeight,
        },
      );
      return null;
    } catch (cause) {
      return message(cause, 'Could not grab the frames');
    }
  };

  /**
   * Items stored by the version that read them back too early — a clip with
   * no length or frame window, a still with no size — are redone from the
   * files kept with them, once, after restoring. A clip's frames are grabbed
   * afresh, which also replaces a first frame that came out black.
   */
  const repaired = useRef(false);
  useEffect(() => {
    if (!restored || repaired.current) return;
    repaired.current = true;
    void (async () => {
      for (const item of itemsRef.current) {
        if (item.id || item.stage !== 'ready') continue;
        if (item.kind === 'clip' && (!item.durationSeconds || !item.window)) {
          const problem = await regrab(item.key);
          if (problem) patch(item.key, { warning: `Could not re-read this clip: ${problem}` });
        } else if (item.kind === 'still' && !item.width) {
          const kept = files.current.get(item.key);
          if (!kept?.original) continue;
          const bitmap = await decodeImage(kept.original).catch(() => null);
          if (!bitmap) continue;
          const insets = detectBorder(bitmap);
          bitmap.close();
          const problem = await retrim(item.key, insets);
          if (problem) patch(item.key, { warning: `Could not re-read this photo: ${problem}` });
        }
      }
    })();
    // Once, after restoring; the helpers read everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  const setCover: AddQueue['setCover'] = async (key, picked) => {
    const kept = files.current.get(key);
    if (!kept) return 'The clip is no longer here';
    try {
      // Re-encoded through a canvas, so a phone photo's GPS never goes up with it.
      const cover = picked ? await prepareCover(picked) : undefined;
      await replaceClipFiles(key, { ...kept, cover }, { hasCover: Boolean(cover) });
      return null;
    } catch {
      // HEIC is the usual one: Safari decodes it, Chrome does not.
      return 'Could not read that image. Try a JPEG or PNG.';
    }
  };

  const retouched: AddQueue['retouched'] = (key, image) =>
    patch(key, { ...image, thumb: image.imageUrl, note: `${image.width}×${image.height}` } as Partial<StillItem>);

  /**
   * Sends one local item: its files to R2, then a draft row for them. Returns
   * the row id, or null with the reason on the row. The local copy goes only
   * once the row exists — from then on the row is the copy, and a reload
   * brings it back through `adopt` rather than uploading it twice.
   */
  async function send(key: string): Promise<string | null> {
    const item = current(key);
    const kept = files.current.get(key);
    if (!item || !kept) return null;
    patch(key, { stage: 'uploading', progress: 0, error: '' });
    try {
      // One bar across every object, weighted by size.
      const blobs = [kept.upload, kept.cover ?? kept.poster, kept.sprite].filter((blob): blob is Blob => Boolean(blob));
      const total = blobs.reduce((sum, blob) => sum + blob.size, 0);
      let done = 0;
      const put = async (blob: Blob, name: string, prefix: 'photos' | 'videos' | 'posters' | 'sprites' | 'covers') => {
        const url = await uploadFile(blob, name, prefix, (percent) =>
          patch(key, { progress: Math.round(((done + (blob.size * percent) / 100) / total) * 100) }),
        );
        done += blob.size;
        return url;
      };

      let id: string;
      if (item.kind === 'still') {
        const imageUrl = await put(kept.upload, kept.upload.name, 'photos');
        patch(key, { stage: 'saving' });
        const colour = extras.current.get(key)?.colour;
        if (!colour) throw new Error('The colour analysis is missing — remove this and add it again');
        const result = await createDraftStill({
          upload: { imageUrl, width: item.width, height: item.height, ...colour },
          fields: current(key)!.fields as StillFields,
        });
        if (result.error !== undefined) throw new Error(result.error);
        id = result.id;
        patch(key, { imageUrl } as Partial<StillItem>);
      } else {
        const base = kept.upload.name.replace(/\.[^.]+$/, '');
        const videoUrl = await put(kept.upload, kept.upload.name, 'videos');
        // A hand-picked cover goes under covers/, which is how the edit form
        // tells one from a grabbed frame (lib/video/cover.ts).
        const posterImageUrl = kept.cover
          ? await put(kept.cover, encodedFilename(`${base}-cover.webp`, kept.cover.type), 'covers')
          : await put(kept.poster!, encodedFilename(`${base}-poster.webp`, kept.poster!.type), 'posters');
        const spriteUrl = await put(kept.sprite!, encodedFilename(`${base}-sprite.webp`, kept.sprite!.type), 'sprites');
        patch(key, { stage: 'saving' });
        const result = await createDraftClip({
          upload: {
            videoUrl,
            posterImageUrl,
            spriteUrl,
            spriteFrames: extras.current.get(key)?.spriteFrames ?? 0,
            width: item.width,
            height: item.height,
            durationSeconds: (item as ClipItem).durationSeconds,
          },
          fields: current(key)!.fields as ClipFields,
        });
        if (result.error !== undefined) throw new Error(result.error);
        id = result.id;
      }

      await forgetItem(key).catch(() => undefined);
      files.current.delete(key);
      patch(key, (latest) => ({ id, stage: 'ready', progress: 100, saved: JSON.stringify(latest.fields) }));
      return id;
    } catch (cause) {
      // Back to ready, not failed: the local copy is intact and Publish can try again.
      patch(key, { stage: 'ready', progress: 100, error: `Upload failed: ${message(cause, 'unknown error')}` });
      return null;
    }
  }

  const publish: AddQueue['publish'] = async () => {
    setPublishing(true);
    try {
      // Pending autosaves on uploaded drafts go first: publish checks the
      // stored row, and a place typed a moment ago must be in it.
      for (const [key, pending] of timers.current) {
        clearTimeout(pending.timer);
        await flush(key);
      }

      const chosen = itemsRef.current.filter(
        (item) => item.selected && item.stage === 'ready' && !problemsOf(item).length,
      );
      if (!chosen.length) return { published: 0, refused: 0 };

      // One at a time: the uploader already saturates a home connection, and
      // a batch that fails partway leaves a clean line between sent and not.
      const rows: { kind: 'still' | 'clip'; id: string }[] = [];
      let failed = 0;
      for (const item of chosen) {
        const id = item.id ?? (await send(item.key));
        if (id) rows.push({ kind: item.kind, id });
        else failed += 1;
      }
      if (!rows.length) return { published: 0, refused: failed };

      // The whole batch goes live in one step, after everything is uploaded.
      const result = await publishDrafts({
        stills: rows.filter((row) => row.kind === 'still').map((row) => row.id),
        clips: rows.filter((row) => row.kind === 'clip').map((row) => row.id),
      });
      if (result.error !== undefined) return { error: result.error };

      const published = new Set(result.published);
      const refused = new Map(result.refused.map((entry) => [entry.id, entry.error]));
      for (const id of published) gone.current.add(id);
      for (const item of itemsRef.current) if (item.id && published.has(item.id)) forget(item.key);
      update((prev) =>
        prev
          .filter((item) => !(item.id && published.has(item.id)))
          .map((item) => (item.id && refused.has(item.id) ? { ...item, error: refused.get(item.id)! } : item)),
      );
      router.refresh();
      return { published: published.size, refused: refused.size + failed };
    } finally {
      setPublishing(false);
    }
  };

  const value: AddQueue = {
    items,
    restored,
    addFiles,
    adopt,
    edit,
    editMany,
    select,
    remove,
    retry,
    original,
    retrim,
    clipSource,
    regrab,
    setCover,
    retouched,
    publish,
    publishing,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * For the sidebar and tab bar: what is running in this tab, whether that is a
 * transfer, and how many processed items are waiting in this browser.
 */
export function useQueueActivity(): { running: number; percent: number | null; sending: boolean; waiting: number } {
  const { items } = useAddQueue();
  return useMemo(
    () => ({
      running: items.filter((item) => inFlight(item.stage)).length,
      percent: queueProgress(items),
      sending: items.some((item) => sending(item.stage)),
      waiting: items.filter((item) => !item.id && item.stage === 'ready').length,
    }),
    [items],
  );
}
