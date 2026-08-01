'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CARD_PADDING, FRAME_HEIGHT, Polaroid, type PolaroidPhoto } from './Polaroid';
import { Lightbox } from './Lightbox';
import { justifyRows } from '@/lib/photo/justify';

/**
 * Justified rows: justifyRows packs the photos into rows that span the measured
 * width exactly, and each frame is rendered at the height its row settled on.
 * Order comes in already sorted by colour — see sortPhotosForWall.
 *
 * The frames stay a single flat flex-wrap list rather than one element per row.
 * Because every row is packed to just under the container width, flex wraps at
 * exactly the row boundaries anyway — and keeping the list flat is what lets the
 * FLIP re-flow and the entry stagger below index straight into `photos`.
 */

/** Matches the container's gap-5. */
const GAP = 20;

/** Gap between one frame's arrival and the next. */
const STAGGER_STEP_MS = 45;

/**
 * Ceiling on the whole sequence. Without it the delay scales with the photo
 * count, and a wall of sixty would leave the last frames arriving four seconds
 * after the first — long past the point where it reads as staging rather than a
 * page still loading. Past the cap the remaining frames arrive together.
 */
const STAGGER_MAX_MS = 450;

/** How far up from the bottom edge a frame must come before it reveals. */
const REVEAL_MARGIN = '0px 0px -8% 0px';

/** Time a surviving frame takes to slide to its new place after a filter change. */
const REFLOW_MS = 320;

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PolaroidWall({ photos }: { photos: PolaroidPhoto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  /** Where each frame sat before this render, for the re-flow below. */
  const lastRects = useRef(new Map<string, DOMRect>());
  /**
   * Zero until the wall has been measured. The first render — including the
   * server's — falls back to unjustified frames at the target height, which is
   * the right shape already; the measurement only tightens each row to the edge.
   */
  const [wallWidth, setWallWidth] = useState(0);

  // Width, not a breakpoint: the packing has to react to the sidebar-less mobile
  // layout and to a window drag alike, and only the real box knows.
  useLayoutEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;

    const observer = new ResizeObserver(([entry]) => {
      // Rounded down so a fractional width can never exceed the box and push the
      // last frame of a row onto its own line.
      setWallWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(wall);
    return () => observer.disconnect();
  }, []);

  /**
   * Keyed by id rather than index so the lookup survives a filter change, where
   * the same photo lands at a different position.
   */
  const placement = useMemo(() => {
    const rows = justifyRows(
      photos.map((photo) => ({
        id: photo.id,
        ratio: photo.height > 0 ? photo.width / photo.height : 1,
      })),
      wallWidth,
      { targetHeight: FRAME_HEIGHT, gap: GAP, padding: CARD_PADDING },
    );
    return new Map(rows.flat().map((item) => [item.id, item]));
  }, [photos, wallWidth]);

  /**
   * Filtering rewrites the wall in place — same pathname, so the page itself is
   * not remounted and surviving frames would otherwise jump to their new slots.
   * This is FLIP: read where each one has landed, then play it back from where
   * it used to be. Only frames that survived the change have a previous
   * position; newly matched ones fall through to the entry animation instead.
   */
  useLayoutEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;

    const previous = lastRects.current;
    const current = new Map<string, DOMRect>();
    const items = Array.from(wall.children) as HTMLElement[];
    const reduced = prefersReducedMotion();

    items.forEach((item, index) => {
      const id = photos[index]?.id;
      if (!id) return;

      const box = item.getBoundingClientRect();
      current.set(id, box);

      const before = previous.get(id);
      if (!before || reduced) return;

      const dx = before.left - box.left;
      const dy = before.top - box.top;
      // Sub-pixel drift is not worth an animation, and animating every frame on
      // every render would fight the entry stagger.
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      item.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: REFLOW_MS, easing: EASE },
      );
    });

    lastRects.current = current;
  }, [photos]);

  /**
   * Frames below the fold wait for the scroll to reach them. Only those are held
   * back: anything already on screen keeps the entry stagger it would have had,
   * so nothing that was visible at first paint blinks out to be revealed again.
   */
  useLayoutEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    // A reduced-motion visitor gets the whole wall at once. Hiding content until
    // it is scrolled to is motion in its own right, however gently it arrives.
    if (prefersReducedMotion()) return;

    const items = Array.from(wall.children) as HTMLElement[];
    const pending = items.filter(
      (item) => item.getBoundingClientRect().top > window.innerHeight,
    );
    for (const item of pending) item.dataset.pending = 'true';
    if (pending.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Entries arrive together for a row scrolled into view at once; ordering
        // their delays turns that into the same left-to-right sweep as the
        // initial load rather than the whole row flashing on.
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const item = entry.target as HTMLElement;
          item.style.setProperty('--stagger', `${order * STAGGER_STEP_MS}ms`);
          order += 1;
          delete item.dataset.pending;
          observer.unobserve(item);
        }
      },
      { rootMargin: REVEAL_MARGIN },
    );

    for (const item of pending) observer.observe(item);
    return () => observer.disconnect();
  }, [photos]);

  if (photos.length === 0) {
    return <p className="text-sm text-ash">No photos match these filters.</p>;
  }

  return (
    <>
      <div ref={wallRef} className="flex flex-wrap gap-5">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            aria-label={`Open ${photo.location} full screen`}
            onClick={() => setOpenIndex(index)}
            className="stagger-in max-w-full text-left"
            // The delay rides on a custom property so the keyframes stay in the
            // stylesheet; only the one per-item number comes from here.
            style={
              {
                '--stagger': `${Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`,
              } as React.CSSProperties
            }
          >
            <Polaroid
              photo={photo}
              height={placement.get(photo.id)?.height}
              width={placement.get(photo.id)?.width}
            />
          </button>
        ))}
      </div>
      {openIndex !== null ? (
        <Lightbox
          photos={photos}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      ) : null}
    </>
  );
}
