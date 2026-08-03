'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrimControls } from './TrimControls';
import { BUTTON, LABEL } from './fields';
import { analyzePixels } from '@/lib/color/analyze';
import { hasBorder, type BorderInsets } from '@/lib/photo/border';
import { decodeImage, detectBorder, renderTrimmed } from '@/lib/photo/trim-client';
import { uploadFile } from '@/lib/storage/upload-client';
import { retouchPhoto } from '@/app/admin/photos/actions';

interface Props {
  id: string;
  imageUrl: string;
}

/**
 * Crops a baked-in white frame off an *already stored* photo. The same tool runs
 * inside PhotoForm for photos that have not been uploaded yet; the difference is
 * only what happens on apply, so the preview and inset controls are shared —
 * see TrimControls.
 *
 * Applying re-encodes the crop, uploads it as a new object and repoints the row;
 * the pre-trim file is then deleted. There is no undo, so the original should
 * exist somewhere outside R2 before this is used.
 */
export function BorderTrimmer({ id, imageUrl }: Props) {
  const router = useRouter();
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [insets, setInsets] = useState<BorderInsets | null>(null);
  const [status, setStatus] = useState('Loading the image…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Through our own origin, so the canvas stays readable — see the route.
        const response = await fetch(
          `/api/admin/photo-source?url=${encodeURIComponent(imageUrl)}`,
        );
        if (!response.ok) throw new Error(`Could not load the image (${response.status})`);

        const decoded = await decodeImage(await response.blob());
        if (cancelled) {
          decoded.close();
          return;
        }

        bitmapRef.current = decoded;
        setBitmap(decoded);
        const detected = detectBorder(decoded);
        setInsets(detected);
        setStatus(
          hasBorder(detected)
            ? 'Found a white border. Check the preview before applying.'
            : 'No white border found. Enter the sides by hand if you can see one.',
        );
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Could not load the image');
        setStatus('');
      }
    }

    load();
    return () => {
      cancelled = true;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, [imageUrl]);

  async function apply() {
    const source = bitmapRef.current;
    if (!source || !insets) return;
    if (!hasBorder(insets)) {
      setError('Nothing to trim — every side is zero.');
      return;
    }

    setBusy(true);
    setError('');
    setStatus('Re-encoding…');

    try {
      const trimmed = await renderTrimmed(source, insets, `photo-${id}.webp`);
      // Recomputed from the trimmed pixels: the old stats included the frame,
      // and the wall orders by them.
      const colour = analyzePixels(trimmed.pixels);

      setStatus('Uploading…');
      setProgress(0);
      const url = await uploadFile(trimmed.file, trimmed.file.name, 'photos', setProgress);

      const result = await retouchPhoto({
        id,
        imageUrl: url,
        width: trimmed.width,
        height: trimmed.height,
        avgHue: colour.avgHue,
        avgChroma: colour.avgChroma,
        avgLightness: colour.avgLightness,
        warmth: colour.warmth,
        isMonochrome: colour.isMonochrome,
      });
      if (result.error) throw new Error(result.error);

      setStatus('Trimmed. The stored photo is now the cropped version.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not trim the photo');
      setStatus('');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-hairline bg-frame p-4">
      <h3 className={LABEL}>Trim white border</h3>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {status ? <p className="text-xs text-ash">{status}</p> : null}

      {insets ? (
        <>
          <TrimControls
            bitmap={bitmap}
            insets={insets}
            onChange={setInsets}
            onRedetect={() => {
              const source = bitmapRef.current;
              if (source) setInsets(detectBorder(source));
            }}
            disabled={busy}
          />

          <button type="button" onClick={apply} disabled={busy} className={BUTTON}>
            {busy
              ? progress !== null
                ? `Uploading… ${progress}%`
                : 'Working…'
              : 'Trim and replace'}
          </button>

          {/* Stated plainly rather than behind a confirm step: the destructive
              part is that the pre-trim file in R2 is replaced, which a second
              click would not make any more reversible. */}
          <p className="text-xs text-ash">
            Replaces the stored file — keep your master copy elsewhere.
          </p>
        </>
      ) : null}
    </section>
  );
}
