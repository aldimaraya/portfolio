'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CARD_PADDING, FRAME_HEIGHT, Polaroid, type PolaroidPhoto } from './Polaroid';
import { Lightbox } from './Lightbox';
import { WallLoader } from './WallLoader';
import { justifyRows } from '@/lib/photo/justify';
import { useAssetsReady } from '@/components/site/useAssetsReady';

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
 *
 * Held to ~200ms: measured across a navigation the stagger was the last thing
 * still moving, ~650ms after the click, which reads as staging at 200 and as a
 * slow page at 450.
 */
const STAGGER_MAX_MS = 220;

/**
 * How close a frame must come before it reveals. Deliberately *ahead* of the
 * viewport rather than inside it: a frame is not mounted until it reveals, and
 * next/image cannot start fetching a frame that has not mounted. Revealing at
 * the bottom edge meant every image began downloading at the moment it became
 * visible, so the empty frame was always on screen first. This buys roughly a
 * screenful of head start.
 */
const REVEAL_MARGIN = '0px 0px 300px 0px';

/**
 * Frames loaded eagerly instead of lazily. Covers the first row or two at most
 * viewport widths — the images already on screen at first paint, which should
 * never be waiting on an intersection callback.
 */
const EAGER_FRAMES = 8;

/**
 * How many frames the cascade waits for. Fewer than are loaded eagerly, and
 * deliberately so: the gate costs whatever the *slowest* image in it costs, so
 * counting all eight put first paint 560ms later on a 5 Mbps line while the two
 * stragglers finished. One row is enough to make the cascade look like a wall
 * arriving rather than a row arriving; the rest land underneath it, behind their
 * own placeholder colours, while the visitor is looking at the top of the page.
 */
const GATE_FRAMES = 4;

/** Time a surviving frame takes to slide to its new place after a filter change. */
const REFLOW_MS = 320;

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PolaroidWall({ photos }: { photos: PolaroidPhoto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  /**
   * The wall waits on the top row only — never on the whole wall. Everything
   * past EAGER_FRAMES is lazy and reveals on scroll, so counting it would hold
   * the cascade behind images that have not been asked for yet and, on a long
   * wall, never resolve at all.
   */
  const { ready, showLoader, noteSettled } = useAssetsReady(
    Math.min(GATE_FRAMES, photos.length),
  );
  const wallRef = useRef<HTMLDivElement>(null);
  /** Where each frame sat before this render, for the re-flow below. */
  const lastRects = useRef(new Map<string, DOMRect>());
  /**
   * Zero until the wall has been measured. The first render — including the
   * server's — falls back to unjustified frames at the target height, which is
   * the right shape already; the measurement only tightens each row to the edge.
   */
  const [wallWidth, setWallWidth] = useState(0);
  /** Each frame's button, so the lightbox can grow out of the one you clicked. */
  const frames = useRef(new Map<string, HTMLButtonElement>());

  /**
   * Where the photo at an index currently sits on the wall, for the lightbox's
   * expand and shrink. Read on demand rather than captured at click: by the time
   * it closes you may have arrowed onto a different photo, and it should return
   * to that one's frame. Null when the frame is no longer on screen — scrolled
   * away, or filtered out — and the lightbox falls back to a plain fade.
   */
  const originFor = useCallback(
    (index: number) => {
      const id = photos[index]?.id;
      const frame = id ? frames.current.get(id) : undefined;
      return frame ? frame.getBoundingClientRect() : null;
    },
    [photos],
  );

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
          // Capped like the initial load. A batch large enough to pass the cap
          // is exactly the case the cap exists for, and this path can produce
          // one: the observer's margin reaches 300px past the fold, so several
          // rows can reveal in a single callback.
          item.style.setProperty(
            '--stagger',
            `${Math.min(order * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`,
          );
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
      {showLoader ? <WallLoader /> : null}
      <div
        ref={wallRef}
        data-assets-loading={ready ? undefined : 'true'}
        className="flex flex-wrap gap-5"
      >
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            ref={(node) => {
              if (node) frames.current.set(photo.id, node);
              else frames.current.delete(photo.id);
            }}
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
              priority={index < EAGER_FRAMES}
              onSettled={index < GATE_FRAMES ? noteSettled : undefined}
            />
          </button>
        ))}
      </div>
      {openIndex !== null ? (
        <Lightbox
          photos={photos}
          index={openIndex}
          originFor={originFor}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      ) : null}
    </>
  );
}
