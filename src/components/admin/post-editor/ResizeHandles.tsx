'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clampScale, MAX_SCALE, MIN_SCALE, SCALE_STEP } from '@/lib/post/fit';

type Side = 'left' | 'right';

/**
 * The share of its row the figure holding this element is drawn at — measured,
 * not read off the block, because the height cap can hold a portrait well under
 * its stored scale. Starting a drag from the stored 100% would leave the first
 * half of the drag doing nothing visible.
 */
function drawnScale(handle: HTMLElement): { scale: number; rowWidth: number } | null {
  const figure = handle.closest('figure');
  const row = figure?.parentElement;
  if (!figure || !row || !row.clientWidth) return null;
  return { scale: (figure.getBoundingClientRect().width / row.clientWidth) * 100, rowWidth: row.clientWidth };
}

/**
 * Grips on both edges of a selected photos block. The figure is centred, so an
 * edge dragged out by a pixel widens it by two; each grip is also a slider for
 * the keyboard, and a double-click puts the block back to full size.
 */
export function ResizeHandles({ scale, onScale }: { scale: number; onScale: (scale: number) => void }) {
  const drag = useRef<{ side: Side; x: number; start: number; rowWidth: number; last: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function begin(side: Side, event: PointerEvent<HTMLSpanElement>) {
    const drawn = drawnScale(event.currentTarget);
    if (!drawn) return;
    // Otherwise the drag selects the caption and the page text around it.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { side, x: event.clientX, start: drawn.scale, rowWidth: drawn.rowWidth, last: scale };
    setDragging(true);
  }

  function move(event: PointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (!current) return;
    const outward = (event.clientX - current.x) * (current.side === 'right' ? 1 : -1);
    const next = clampScale(current.start + ((2 * outward) / current.rowWidth) * 100);
    if (next === current.last) return;
    current.last = next;
    onScale(next);
  }

  function end() {
    drag.current = null;
    setDragging(false);
  }

  function key(event: KeyboardEvent<HTMLSpanElement>) {
    // Left and right mean narrower and wider whichever grip has focus — a slider,
    // not a pointer, so the arrows do not swap meaning between the two edges.
    const from = drawnScale(event.currentTarget)?.scale ?? scale;
    const next =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? clampScale(from - SCALE_STEP)
        : event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? clampScale(from + SCALE_STEP)
          : event.key === 'Home'
            ? MIN_SCALE
            : event.key === 'End'
              ? MAX_SCALE
              : null;
    if (next === null) return;
    event.preventDefault();
    onScale(next);
  }

  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <span
          key={side}
          role="slider"
          tabIndex={0}
          aria-label="Photo width"
          aria-valuemin={MIN_SCALE}
          aria-valuemax={MAX_SCALE}
          aria-valuenow={scale}
          aria-valuetext={`${scale}%`}
          className="editor-resize-handle"
          data-side={side}
          title="Drag to resize · double-click for full size"
          onPointerDown={(event) => begin(side, event)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onDoubleClick={() => onScale(MAX_SCALE)}
          onKeyDown={key}
        />
      ))}
      {dragging ? <span className="editor-resize-readout">{scale}%</span> : null}
    </>
  );
}
