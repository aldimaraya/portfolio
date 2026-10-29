'use client';

import { useEffect, useRef, useState } from 'react';
import { NO_BORDER, type BorderInsets } from '@/lib/photo/border';
import { decodeImage, detectBorder } from '@/lib/photo/trim-client';
import { TrimControls } from '../TrimControls';
import { BUTTON, LABEL } from '../fields';

/**
 * The trim review for a still that has not been uploaded: the same controls as
 * BorderTrimmer, but working on the original kept in this browser, and applying
 * only re-cuts the local copy. Starting from the original is what lets a border
 * cut too deep be given back — the processed copy could only be cut further.
 */
export function LocalTrimmer({
  original,
  insets: cut,
  onApply,
}: {
  original: File;
  /** What was cut on pick; null when nothing was. */
  insets: BorderInsets | null;
  /** Re-cuts the queued copy; resolves to an error message, or null. */
  onApply: (insets: BorderInsets) => Promise<string | null>;
}) {
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [insets, setInsets] = useState<BorderInsets>(cut ?? NO_BORDER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    decodeImage(original).then(
      (decoded) => {
        if (cancelled) return decoded.close();
        bitmapRef.current = decoded;
        setBitmap(decoded);
      },
      (cause) => !cancelled && setError(cause instanceof Error ? cause.message : 'Could not read the original'),
    );
    return () => {
      cancelled = true;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, [original]);

  async function apply(next: BorderInsets) {
    setBusy(true);
    setError('');
    const problem = await onApply(next);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-hairline bg-frame p-4">
      <h3 className={LABEL}>Trim white border</h3>
      <p className="text-xs text-ash">
        {cut
          ? 'From the original, with the border that was cut. Nothing is uploaded until you publish.'
          : 'No border was found. Enter the sides by hand if you can see one.'}
      </p>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <TrimControls
        bitmap={bitmap}
        insets={insets}
        onChange={setInsets}
        onRedetect={() => bitmapRef.current && setInsets(detectBorder(bitmapRef.current))}
        disabled={busy || !bitmap}
      />
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => apply(insets)} disabled={busy || !bitmap} className={BUTTON}>
          {busy ? 'Working…' : 'Apply'}
        </button>
        {cut ? (
          <button
            type="button"
            onClick={() => apply(NO_BORDER)}
            disabled={busy || !bitmap}
            className="text-sm text-ash transition hover:text-bone disabled:opacity-50"
          >
            Keep the border
          </button>
        ) : null}
      </div>
    </section>
  );
}
