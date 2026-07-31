'use client';

import { useEffect, useMemo } from 'react';
import { LABEL } from './fields';

interface Props {
  label: string;
  accept: string;
  /** URL already stored for this record, shown when nothing new is selected. */
  value: string;
  /** The pending selection, owned by the parent so it can upload on save. */
  file: File | null;
  onSelect: (file: File | null) => void;
  hint?: string;
  warnAboveBytes?: number;
  /** Upload percentage while the parent is saving, or null when idle. */
  progress?: number | null;
  /** How to preview the pending file. Videos need a <video>, not an <img>. */
  previewAs?: 'image' | 'video';
}

/**
 * Picks a file and previews it locally — it does not upload. The parent sends the
 * file to R2 when the form is saved, so browsing away without saving never leaves
 * an orphaned object in the bucket.
 */
export function UploadField({
  label,
  accept,
  value,
  file,
  onSelect,
  hint,
  warnAboveBytes,
  progress = null,
  previewAs = 'image',
}: Props) {
  // Derived from the file rather than held in state: setting state from an effect
  // would cascade an extra render on every pick.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  // Revoked on replacement and unmount; leaking object URLs pins the
  // full-resolution file in memory for the life of the page.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const warning =
    file && warnAboveBytes && file.size > warnAboveBytes
      ? `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB — larger than expected. Upload the compressed web encode, not the 4K master.`
      : '';

  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
        className="text-sm text-ash file:mr-3 file:rounded file:border file:border-hairline file:bg-frame file:px-3 file:py-1 file:text-bone"
      />
      {hint ? <span className="text-xs text-ash">{hint}</span> : null}

      {preview ? (
        <>
          {previewAs === 'video' ? (
            <video
              src={preview}
              controls
              muted
              playsInline
              className="mt-1 max-h-56 w-full rounded border border-hairline bg-black object-contain"
            />
          ) : (
            /* Plain <img>: a local object URL, not something to hand to the
               image optimiser. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt=""
              className="mt-1 max-h-40 w-full rounded border border-hairline object-contain"
            />
          )}
          <span className="truncate text-xs text-ash">
            {file?.name} · uploads when you save
          </span>
        </>
      ) : value ? (
        <span className="truncate text-xs text-ash">Stored: {value}</span>
      ) : null}

      {warning ? <span className="text-xs text-amber-400">{warning}</span> : null}
      {progress !== null ? (
        <span className="text-xs text-gold">Uploading… {progress}%</span>
      ) : null}
    </label>
  );
}
