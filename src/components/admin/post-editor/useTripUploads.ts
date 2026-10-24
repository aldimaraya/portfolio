'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { addJournalPhoto, fillJournalPhoto, findJournalDuplicate, type JournalPhotoRow } from '@/app/admin/posts/actions';
import { NO_BORDER } from '@/lib/photo/border';
import { extractPhotoExif } from '@/lib/photo/exif';
import { fingerprintPixels } from '@/lib/photo/fingerprint';
import { decodeImage, prepareUpload } from '@/lib/photo/trim-client';
import { uploadFile } from '@/lib/storage/upload-client';
import { wallClockAsUtc } from '@/lib/post/trip';

/**
 * Where the file in hand is. Preparing — decoding a 24-megapixel frame and
 * re-encoding it — takes a visible second or two before a byte is sent, and a
 * photo is usually one part, so the upload percentage alone sat at 0% through
 * all of that and then jumped. The stage is what says something is happening.
 */
export type UploadStage = 'preparing' | 'uploading' | 'saving';

export interface UploadProgress {
  total: number;
  done: number;
  /** The file being sent now, which step it is on, and how far through the upload. */
  current: { name: string; stage: UploadStage; percent: number } | null;
  /** The file is kept so a failure can be retried without picking it again. */
  failed: { name: string; reason: string; item: QueueItem }[];
  /**
   * Looked like a photo already in the post, so nothing was sent. `filled` is
   * what this file's EXIF gave back to the stored copy, which had lost it.
   */
  skipped: { name: string; file: File; filled: ('date' | 'place')[] }[];
}

/** `force` sends a file the duplicate check would otherwise skip. */
interface QueueItem {
  file: File;
  force?: boolean;
}

/** How far through the whole batch, 0–1, crediting the file in hand by its upload. */
export function batchFraction({ total, done, current }: UploadProgress): number {
  if (!total) return 0;
  return Math.min(1, (done + (current ? current.percent / 100 : 0)) / total);
}

/**
 * What to put in front of a failure, so "Load failed" says which step broke.
 * The upload's own errors already name their request, so they pass as they are.
 */
const FAILED_WHILE: Record<UploadStage, string> = {
  preparing: 'Could not read this photo',
  uploading: '',
  saving: 'Uploaded, but could not be added to the post',
};

const IDLE: UploadProgress = { total: 0, done: 0, current: null, failed: [], skipped: [] };

/**
 * Uploads a dump of trip photos into a post, one at a time, each through the
 * same path a still takes:
 *
 *   1. EXIF is read from the original first — the capture date is what sorts a
 *      trip into days, and it is about to be stripped.
 *   2. prepareUpload re-encodes any file carrying EXIF through a canvas, so no
 *      GPS coordinates reach the bucket (see keepsOriginal), and caps its size.
 *   3. Its fingerprint — computed from the sample prepareUpload has already
 *      drawn — is checked against every photo the database holds for the post,
 *      and a match is skipped before a byte is sent. A
 *      skipped original still hands its date and GPS to the stored copy if that
 *      copy is missing them: re-picking the originals is how a photo uploaded
 *      before locations were kept gets one.
 *   4. Browser → R2 multipart, then a row recording it against the post, with
 *      the GPS fix alongside — the server rounds it and names the place.
 *
 * One at a time so a forty-photo dump does not hold forty decoded bitmaps at
 * once; a failure is reported and the rest carry on.
 */
export function useTripUploads(
  postId: string,
  onUploaded: (photo: JournalPhotoRow) => void,
  onFilled: (photo: JournalPhotoRow) => void,
) {
  const [progress, setProgress] = useState<UploadProgress>(IDLE);
  const queue = useRef<QueueItem[]>([]);
  const running = useRef(false);
  const uploaded = useRef(onUploaded);
  const filled = useRef(onFilled);
  useEffect(() => {
    uploaded.current = onUploaded;
    filled.current = onFilled;
  }, [onUploaded, onFilled]);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    /**
     * Whether the database already holds this picture. A check that cannot be
     * made lets the upload through: a duplicate costs a delete in the tray, a
     * wrongly skipped photo costs noticing it was never sent.
     */
    async function storedMatch(fingerprint: string | null): Promise<JournalPhotoRow | null> {
      if (!fingerprint) return null;
      const result = await findJournalDuplicate({ postId, fingerprint }).catch(() => ({ photo: null }));
      return result.photo ?? null;
    }

    /**
     * What a skipped original can give the stored copy it matched. Best-effort:
     * the photo was skipped either way, and a failure here is not worth a red line.
     */
    async function fillFrom(
      stored: JournalPhotoRow,
      takenAt: string | null,
      gps: { latitude: number | null; longitude: number | null },
    ): Promise<('date' | 'place')[]> {
      const wantsDate = !stored.takenAt && takenAt !== null;
      const wantsPlace = !stored.place && gps.latitude !== null && gps.longitude !== null;
      if (!wantsDate && !wantsPlace) return [];

      const result = await fillJournalPhoto({ postId, id: stored.id, takenAt, ...gps }).catch(() => ({ photo: undefined }));
      if (!result.photo) return [];
      filled.current(result.photo);
      return [
        ...(!stored.takenAt && result.photo.takenAt ? (['date'] as const) : []),
        ...(!stored.place && result.photo.place ? (['place'] as const) : []),
      ];
    }

    while (queue.current.length) {
      const item = queue.current.shift()!;
      const { file } = item;
      let stage: UploadStage = 'preparing';
      setProgress((state) => ({ ...state, current: { name: file.name, stage, percent: 0 } }));

      try {
        const exif = await extractPhotoExif(file);
        const bitmap = await decodeImage(file);
        let prepared;
        try {
          prepared = await prepareUpload(bitmap, NO_BORDER, file, exif.hasExif);
        } finally {
          bitmap.close();
        }

        const takenAt = exif.capturedAt ? wallClockAsUtc(exif.capturedAt).toISOString() : null;
        const gps = { latitude: exif.latitude ?? null, longitude: exif.longitude ?? null };
        const fingerprint = fingerprintPixels(prepared.pixels, prepared.sampleWidth, prepared.sampleHeight);
        const match = item.force ? null : await storedMatch(fingerprint);
        if (match) {
          const gained = await fillFrom(match, takenAt, gps);
          setProgress((state) => ({
            ...state,
            done: state.done + 1,
            skipped: [...state.skipped, { name: file.name, file, filled: gained }],
          }));
          continue;
        }

        stage = 'uploading';
        setProgress((state) => ({ ...state, current: { name: file.name, stage: 'uploading', percent: 0 } }));
        const url = await uploadFile(prepared.file, prepared.file.name, 'journal', (percent) =>
          setProgress((state) => ({ ...state, current: { name: file.name, stage: 'uploading', percent } })),
        );

        stage = 'saving';
        setProgress((state) => ({ ...state, current: { name: file.name, stage: 'saving', percent: 100 } }));
        const result = await addJournalPhoto({
          postId,
          imageUrl: url,
          width: prepared.width,
          height: prepared.height,
          takenAt,
          fingerprint,
          ...gps,
        });
        if (!result.photo) throw new Error(result.error ?? 'The upload could not be recorded');

        uploaded.current(result.photo);
        setProgress((state) => ({ ...state, done: state.done + 1 }));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Upload failed';
        const reason = FAILED_WHILE[stage] ? `${FAILED_WHILE[stage]} — ${message}` : message;
        setProgress((state) => ({
          ...state,
          done: state.done + 1,
          failed: [...state.failed, { name: file.name, reason, item }],
        }));
      }
    }

    running.current = false;
    setProgress((state) => ({ ...state, current: null }));
  }, [postId]);

  const queueItems = useCallback(
    (items: QueueItem[]) => {
      const images = items.filter((item) => item.file.type.startsWith('image/'));
      if (!images.length) return;
      queue.current.push(...images);
      setProgress((state) =>
        // A finished batch is forgotten when the next one starts.
        state.current || queue.current.length > images.length
          ? { ...state, total: state.total + images.length }
          : { ...IDLE, total: images.length },
      );
      void run();
    },
    [run],
  );

  /*
   * Retry and "upload anyway" send their files again as a batch of their own.
   * Both are only offered once the queue has drained, so there is no running
   * batch for them to be folded into — and each takes the other's leftovers
   * with it, rather than dropping them when the new batch resets the status.
   */
  const retry = useCallback(() => {
    const items = [...progress.failed.map((failure) => failure.item), ...progress.skipped.map(({ file }) => ({ file }))];
    setProgress(IDLE);
    queueItems(items);
  }, [queueItems, progress.failed, progress.skipped]);

  const uploadSkipped = useCallback(() => {
    const items = [...progress.skipped.map(({ file }) => ({ file, force: true })), ...progress.failed.map((failure) => failure.item)];
    setProgress(IDLE);
    queueItems(items);
  }, [queueItems, progress.failed, progress.skipped]);

  const add = useCallback((files: File[]) => queueItems(files.map((file) => ({ file }))), [queueItems]);

  const busy = progress.current !== null;
  return { progress, busy, add, retry, uploadSkipped, dismiss: () => setProgress(IDLE) };
}
