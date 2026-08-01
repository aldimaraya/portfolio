'use client';

import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { summarizeSettings } from '@/lib/photo/settings';
import type { PolaroidPhoto } from './Polaroid';

interface LightboxProps {
  photos: PolaroidPhoto[];
  index: number;
  /** The wall frame this photo occupies, or null if it is not on screen. */
  originFor?: (index: number) => DOMRect | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** The expand out of the wall frame, and the shrink back into it. */
const EXPAND_MS = 280;
/** Kept in step with .lightbox[data-flip='true'][data-closing='true'] in globals.css. */
const COLLAPSE_MS = 220;

/** One photo sliding off as the next slides on. */
const SLIDE_MS = 260;
const SLIDE_DISTANCE = 56;

/** How far a finger must travel before the release counts as a swipe. */
const SWIPE_THRESHOLD = 60;
/**
 * The mat follows the finger at less than full speed. A drag that tracks 1:1
 * feels like the photo has come loose; damped, it reads as resistance that
 * something is holding.
 */
const DRAG_DAMPING = 0.45;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Lightbox({ photos, index, originFor, onClose, onNavigate }: LightboxProps) {
  const photo = photos[index];
  /**
   * The overlay has to outlive the decision to close it, or there is nothing
   * left on screen to animate. Every dismissal sets this instead of unmounting,
   * and the animation's own end event is what finally calls onClose.
   */
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => setClosing(true), []);

  const figureRef = useRef<HTMLElement>(null);
  /** Whether the expand ran, which is also whether the shrink should. */
  const expanded = useRef(false);
  /** The index the last render showed, for the direction of the slide. */
  const shown = useRef(index);
  /** Live touch: where the finger landed, and how far it has travelled. */
  const drag = useRef<{ x: number; y: number; dx: number; axis: 'none' | 'x' | 'y' } | null>(
    null,
  );

  // Wrapping keeps the arrows live at both ends, so holding a key never leaves
  // you stuck on the last frame wondering whether the control broke.
  const step = useCallback(
    (delta: number) => onNavigate((index + delta + photos.length) % photos.length),
    [index, photos.length, onNavigate],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose();
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
      else return;
      event.preventDefault();
    }

    document.addEventListener('keydown', onKeyDown);
    // The wall behind the overlay must not scroll while the lightbox owns the
    // arrow keys.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose, step]);

  /**
   * The expand. FLIP, the same technique the wall uses for its re-flow: the mat
   * is already laid out at full size, so it is played back from the frame you
   * clicked — offset to that frame's centre and scaled down to its width —
   * which reads as the print being lifted off the wall rather than a new panel
   * appearing over it.
   *
   * Runs once, on open. Reduced motion, or a frame that is not on screen to
   * grow from, leaves this alone and the overlay's own fade carries the entry.
   */
  useLayoutEffect(() => {
    const figure = figureRef.current;
    const origin = originFor?.(index);
    if (!figure || !origin || prefersReducedMotion()) return;

    const box = figure.getBoundingClientRect();
    if (box.width === 0 || origin.width === 0) return;

    figure.animate(
      [
        { transform: flipTransform(origin, box), opacity: 0.4 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: EXPAND_MS, easing: EASE },
    );
    expanded.current = true;
    // Open only — `index` is deliberately not a dependency, or every arrow press
    // would re-run the expand instead of the slide below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The shrink, back into whichever frame is now underneath. */
  useLayoutEffect(() => {
    const figure = figureRef.current;
    if (!closing || !figure || !expanded.current) return;

    const box = figure.getBoundingClientRect();
    const origin = originFor?.(index);

    figure.animate(
      [
        { transform: 'none', opacity: 1 },
        // No frame to return to — the photo was filtered away, or the wall has
        // been scrolled past it. Settling in place is the honest ending.
        origin && box.width > 0
          ? { transform: flipTransform(origin, box), opacity: 0.2 }
          : { transform: 'scale(0.96)', opacity: 0 },
      ],
      { duration: COLLAPSE_MS, easing: 'ease-in', fill: 'forwards' },
    );
  }, [closing, index, originFor]);

  /**
   * The slide. The mat is one element reused across photos, so there is no
   * outgoing copy to animate against the incoming one; instead the new photo
   * enters from the side it came from, which carries the direction on its own.
   */
  useLayoutEffect(() => {
    const figure = figureRef.current;
    const previous = shown.current;
    shown.current = index;

    if (!figure || previous === index || closing || prefersReducedMotion()) return;

    // Modular, so the wrap from the last photo to the first still slides
    // forwards rather than racing back through the whole set.
    const forward = (index - previous + photos.length) % photos.length <= photos.length / 2;

    figure.animate(
      [
        { transform: `translateX(${forward ? SLIDE_DISTANCE : -SLIDE_DISTANCE}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: SLIDE_MS, easing: EASE },
    );
  }, [index, photos.length, closing]);

  /** Follows the finger, then either completes the swipe or springs back. */
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    drag.current = { x: touch.clientX, y: touch.clientY, dx: 0, axis: 'none' };
  };

  const onTouchMove = (event: React.TouchEvent) => {
    const state = drag.current;
    const figure = figureRef.current;
    if (!state || !figure) return;

    const touch = event.touches[0];
    const dx = touch.clientX - state.x;
    const dy = touch.clientY - state.y;

    // The first few pixels decide what the gesture is. A mostly-vertical drag is
    // someone reaching for the caption or bracing the phone, and dragging the
    // photo sideways under them would feel like a misfire.
    if (state.axis === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (state.axis !== 'x') return;

    state.dx = dx;
    figure.style.transform = `translateX(${dx * DRAG_DAMPING}px)`;
    figure.style.opacity = `${Math.max(0.4, 1 - Math.abs(dx) / 600)}`;
  };

  const onTouchEnd = () => {
    const state = drag.current;
    const figure = figureRef.current;
    drag.current = null;
    if (!state || !figure || state.axis !== 'x') return;

    figure.style.transform = '';
    figure.style.opacity = '';

    if (Math.abs(state.dx) >= SWIPE_THRESHOLD && photos.length > 1) {
      // Swiping left pulls the next photo in from the right, matching the way a
      // stack of prints moves under your thumb.
      step(state.dx < 0 ? 1 : -1);
      return;
    }

    // Short of the threshold: back to where it was, from wherever the finger let
    // go, so the gesture resolves rather than snapping.
    figure.animate(
      [{ transform: `translateX(${state.dx * DRAG_DAMPING}px)` }, { transform: 'none' }],
      { duration: 200, easing: EASE },
    );
  };

  if (!photo) return null;

  const caption = [photo.camera, summarizeSettings(photo.settings)].filter(Boolean).join(' · ');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.location}
      // zoom-out on the backdrop, default over the photo itself — the cursor
      // tells you which regions dismiss and which do not.
      className="lightbox fixed inset-0 z-50 flex cursor-zoom-out flex-col bg-black/95 backdrop-blur-sm"
      data-closing={closing ? 'true' : undefined}
      // Tells the stylesheet the mat is carrying the motion itself, so the
      // overlay drops its own scale and just dissolves — two scales at once
      // would read as a lens breathing.
      data-flip={originFor ? 'true' : undefined}
      onClick={requestClose}
      // Scoped to this element: the entry animation on a child would otherwise
      // bubble up here and tear the overlay down the moment it opened.
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-5 py-4 text-xs">
        <div className="font-mono tracking-[0.05em] text-ash">
          {index + 1} / {photos.length}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="px-2 py-1 text-lg leading-none text-ash transition hover:text-gold"
        >
          ✕
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
        <NavButton side="left" disabled={photos.length < 2} onClick={() => step(-1)} />
        {/* The mat, echoing the wall's polaroids: even margins with a deeper
            foot, and the caption printed on the paper rather than floating on
            the backdrop below it. Sized by the image inside it, so it hugs a
            portrait frame instead of spanning the viewport. */}
        <figure
          ref={figureRef}
          className="flex cursor-default flex-col rounded-sm bg-mat p-3 pb-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
          // Clicks on the photo itself shouldn't dismiss — only the backdrop.
          onClick={(event) => event.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <Image
            key={photo.id}
            src={photo.imageUrl}
            alt={photo.location}
            // Intrinsic dimensions rather than `fill`: the mat has to take its
            // size from the picture, and a filled image contributes none.
            width={photo.width}
            height={photo.height}
            sizes="100vw"
            priority
            // The picture is dragged by its mat, not on its own — without this,
            // a swipe on the photo starts a native image drag instead.
            draggable={false}
            className="lightbox-photo"
          />
          <figcaption className="mt-3 mb-1 px-1 text-center">
            <div className="text-sm font-bold tracking-[0.04em] text-matink uppercase">
              {photo.location}
            </div>
            {caption ? (
              <div className="mt-1 font-mono text-[0.7rem] tracking-[0.05em] text-matmeta uppercase">
                {caption}
              </div>
            ) : null}
          </figcaption>
        </figure>
        <NavButton side="right" disabled={photos.length < 2} onClick={() => step(1)} />
      </div>
    </div>
  );
}

/**
 * The transform that puts an element of size `box` back over `origin`: centres
 * matched first, then scaled by width. Height is deliberately not matched —
 * the wall frame and the lightbox mat carry different amounts of caption, and
 * scaling each axis to fit would stretch the print on the way up.
 */
function flipTransform(origin: DOMRect, box: DOMRect): string {
  const dx = origin.left + origin.width / 2 - (box.left + box.width / 2);
  const dy = origin.top + origin.height / 2 - (box.top + box.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${origin.width / box.width})`;
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  if (disabled) return null;

  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`absolute ${side === 'left' ? 'left-2' : 'right-2'} z-10 flex h-12 w-12 items-center justify-center rounded-full bg-frame/70 text-2xl text-ash transition hover:bg-frame hover:text-gold`}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}
