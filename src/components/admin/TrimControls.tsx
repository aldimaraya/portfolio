'use client';

import { useCallback, useEffect, useRef } from 'react';
import { FIELD, LABEL } from './fields';
import { cropRect, type BorderInsets } from '@/lib/photo/border';

const SIDES: { key: keyof BorderInsets; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
];

/** Longest edge of the on-screen preview. */
const PREVIEW_EDGE = 420;

interface Props {
  bitmap: ImageBitmap | null;
  insets: BorderInsets;
  onChange: (insets: BorderInsets) => void;
  onRedetect: () => void;
  disabled?: boolean;
}

/**
 * The shared half of the border trimmer: a preview of the crop and one editable
 * inset per side. Presentational on purpose — it knows nothing about uploads or
 * records, so the upload form and the edit page drive it with the same props.
 *
 * The preview shows the *cropped result* rather than an outline over the
 * original, so what is on screen is what gets stored.
 */
export function TrimControls({ bitmap, insets, onChange, onRedetect, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!bitmap || !canvas) return;

    const rect = cropRect(bitmap.width, bitmap.height, insets);
    const scale = Math.min(1, PREVIEW_EDGE / Math.max(rect.width, rect.height));
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));

    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(
      bitmap,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }, [bitmap, insets]);

  useEffect(paint, [paint]);

  function setSide(key: keyof BorderInsets, raw: string) {
    const value = Number.parseInt(raw, 10);
    onChange({ ...insets, [key]: Number.isFinite(value) ? Math.max(0, value) : 0 });
  }

  const rect = bitmap ? cropRect(bitmap.width, bitmap.height, insets) : null;

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        data-testid="trim-preview"
        className="max-w-full self-start border border-hairline"
      />

      <div className="grid max-w-md grid-cols-4 gap-2">
        {SIDES.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className={LABEL}>{label}</span>
            <input
              type="number"
              min={0}
              className={FIELD}
              aria-label={`${label} inset in pixels`}
              value={insets[key]}
              onChange={(event) => setSide(key, event.target.value)}
              disabled={disabled}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {bitmap && rect ? (
          <p className="font-mono text-xs text-ash">
            {bitmap.width}×{bitmap.height} → {rect.width}×{rect.height}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRedetect}
          disabled={disabled}
          className="text-sm text-ash transition hover:text-bone disabled:opacity-50"
        >
          Re-detect
        </button>
      </div>
    </div>
  );
}
