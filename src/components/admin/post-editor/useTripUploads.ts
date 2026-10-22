'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { addJournalPhoto, type JournalPhotoRow } from '@/app/admin/posts/actions';
import { NO_BORDER } from '@/lib/photo/border';
import { extractPhotoExif } from '@/lib/photo/exif';
import { decodeImage, prepareUpload } from '@/lib/photo/trim-client';
import { uploadFile } from '@/lib/storage/upload-client';
import { wallClockAsUtc } from '@/lib/post/trip';

export interface UploadProgress {
  total: number;
  done: number;
  /** The file being sent now, and how far through it is. */
  current: { name: string; percent: number } | null;
  failed: { name: string; reason: string }[];
}

const IDLE: UploadProgress = { total: 0, done: 0, current: null, failed: [] };

/**
 * Uploads a dump of trip photos into a post, one at a time, each through the
 * same path a still takes:
 *
 *   1. EXIF is read from the original first — the capture date is what sorts a
 *      trip into days, and it is about to be stripped.
 *   2. prepareUpload re-encodes any file carrying EXIF through a canvas, so no
 *      GPS coordinates reach the bucket (see keepsOriginal), and caps its size.
 *   3. Browser → R2 multipart, then a row recording it against the post.
 *
 * One at a time so a forty-photo dump does not hold forty decoded bitmaps at
 * once; a failure is reported and the rest carry on.
 */
export function useTripUploads(postId: string, onUploaded: (photo: JournalPhotoRow) => void) {
  const [progress, setProgress] = useState<UploadProgress>(IDLE);
  const queue = useRef<File[]>([]);
  const running = useRef(false);
  const uploaded = useRef(onUploaded);
  useEffect(() => {
    uploaded.current = onUploaded;
  }, [onUploaded]);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    while (queue.current.length) {
      const file = queue.current.shift()!;
      setProgress((state) => ({ ...state, current: { name: file.name, percent: 0 } }));

      try {
        const exif = await extractPhotoExif(file);
        const bitmap = await decodeImage(file);
        let prepared;
        try {
          prepared = await prepareUpload(bitmap, NO_BORDER, file, exif.hasExif);
        } finally {
          bitmap.close();
        }

        const url = await uploadFile(prepared.file, prepared.file.name, 'journal', (percent) =>
          setProgress((state) => ({ ...state, current: { name: file.name, percent } })),
        );

        const result = await addJournalPhoto({
          postId,
          imageUrl: url,
          width: prepared.width,
          height: prepared.height,
          takenAt: exif.capturedAt ? wallClockAsUtc(exif.capturedAt).toISOString() : null,
        });
        if (!result.photo) throw new Error(result.error ?? 'The upload could not be recorded');

        uploaded.current(result.photo);
        setProgress((state) => ({ ...state, done: state.done + 1 }));
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : 'Upload failed';
        setProgress((state) => ({ ...state, done: state.done + 1, failed: [...state.failed, { name: file.name, reason }] }));
      }
    }

    running.current = false;
    setProgress((state) => ({ ...state, current: null }));
  }, [postId]);

  const add = useCallback(
    (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith('image/'));
      if (!images.length) return;
      queue.current.push(...images);
      setProgress((state) =>
        // A finished batch is forgotten when the next one starts.
        state.current || queue.current.length > images.length
          ? { ...state, total: state.total + images.length }
          : { total: images.length, done: 0, current: null, failed: [] },
      );
      void run();
    },
    [run],
  );

  const busy = progress.current !== null;
  return { progress, busy, add, dismiss: () => setProgress(IDLE) };
}
