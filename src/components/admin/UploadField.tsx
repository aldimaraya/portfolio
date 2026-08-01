'use client';

import { useEffect, useMemo, useState } from 'react';
import { LABEL } from './fields';

/**
 * Whether a dropped file matches the `accept` string. Only the `type/*` form the
 * two forms actually use is handled — the file picker enforces this for itself,
 * but a drop bypasses it entirely.
 */
function accepts(file: File, accept: string): boolean {
  const [type] = accept.split('/');
  return file.type.startsWith(`${type}/`);
}

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
  /** How to preview the file. Videos need a <video>, not an <img>. */
  previewAs?: 'image' | 'video';
  /**
   * Whether a file can be chosen at all. False on the edit pages, which exist to
   * change a record's fields rather than swap its media — and which would
   * otherwise strand the replaced object in R2 with nothing left pointing at it.
   */
  allowSelect?: boolean;
}

/** Starting height of the preview box, which the user can then drag to resize. */
const PREVIEW_HEIGHT = 260;

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
  allowSelect = true,
}: Props) {
  // Derived from the file rather than held in state: setting state from an effect
  // would cascade an extra render on every pick.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState('');

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

  const source = preview || value;

  // `resize-y` needs a non-visible overflow and an explicit height to have
  // something to drag against, so the media fills a sized box rather than
  // setting the height itself.
  const media = source ? (
    <div
      className="mt-1 resize-y overflow-hidden rounded border border-hairline bg-black"
      style={{ height: PREVIEW_HEIGHT, minHeight: 96 }}
    >
      {previewAs === 'video' ? (
        /* Deliberately not muted: nothing autoplays here, so muting only costs
           a click. */
        <video
          src={source}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
        />
      ) : (
        /* Plain <img>: a local object URL or an R2 URL, neither of which is
           worth handing to the image optimiser. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={source} alt="" className="h-full w-full object-contain" />
      )}
    </div>
  ) : null;

  const caption = preview
    ? `${file?.name} · uploads when you save`
    : value
      ? `Stored: ${value}`
      : '';

  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>

      {allowSelect ? (
        <>
          <div
            // The browse button and the drop target are the same box, so there is
            // one place to aim at either way.
            onDragOver={(event) => {
              // Both are required, and on *this* element — without them the
              // browser treats the drop as a navigation and opens the file.
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files[0];
              // A folder, or the wrong kind of file. Silently ignoring it would
              // look like the drop missed, so the caption says what happened.
              if (!dropped) return;
              if (accepts(dropped, accept)) {
                setRejected('');
                onSelect(dropped);
              } else {
                setRejected(`${dropped.name} is not a ${accept.split('/')[0]} file.`);
              }
            }}
            className={`mt-1 flex flex-col items-center gap-2 rounded border border-dashed px-4 py-6 text-center transition ${
              dragging ? 'border-gold bg-gold/5' : 'border-hairline'
            }`}
          >
            <span className="text-xs text-ash">Drag a file here, or</span>
            <input
              type="file"
              accept={accept}
              onChange={(event) => {
                setRejected('');
                onSelect(event.target.files?.[0] ?? null);
              }}
              className="text-sm text-ash file:mr-3 file:rounded file:border file:border-hairline file:bg-frame file:px-3 file:py-1 file:text-bone"
            />
          </div>
          {rejected ? <span className="text-xs text-amber-400">{rejected}</span> : null}
          {hint ? <span className="text-xs text-ash">{hint}</span> : null}
        </>
      ) : null}

      {media}
      {caption ? <span className="truncate text-xs text-ash">{caption}</span> : null}

      {warning ? <span className="text-xs text-amber-400">{warning}</span> : null}
      {progress !== null ? (
        <span className="text-xs text-gold">Uploading… {progress}%</span>
      ) : null}
    </label>
  );
}
