'use client';

import { useEffect, useEffectEvent, useRef } from 'react';

/** Released past this far down, or flicked faster than this, the sheet closes rather than springing back. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.5; // px per ms

/** Matches Tailwind's lg — from there up the drawer is a column, not a sheet. */
const COLUMN_QUERY = '(min-width: 64rem)';

/**
 * Where the inspector lives: a column that slides open beside the grid from lg
 * up, and a sheet that rises over it on a phone. It stays mounted while closed
 * so both directions animate; `onClosed` fires once the close has finished, for
 * the caller to drop what it was showing.
 *
 * On a phone the sheet follows a downward swipe and closes past a distance or a
 * flick. The swipe only starts from the top of whatever is scrolled under the
 * finger — mid-list, a downward swipe is a scroll — or from `[data-sheet-handle]`,
 * which closes from anywhere. While a finger is down the transition is switched
 * off inline so the sheet tracks it 1:1; letting go clears the inline styles, and
 * the class transition carries the sheet from where the finger left it either
 * back up or off the bottom.
 */
export function InspectorDrawer({
  open,
  onClose,
  onClosed,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  children: React.ReactNode;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const el = sheet.current;
    const shade = backdrop.current;
    if (!el || !shade) return;
    let drag: { x: number; y: number; dy: number; at: number; velocity: number; active: boolean } | null = null;

    function reset() {
      for (const node of [el!, shade!]) {
        node.style.transition = '';
        node.style.translate = '';
        node.style.opacity = '';
      }
    }

    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1 || window.matchMedia(COLUMN_QUERY).matches) return;
      const target = event.target as Element;
      if (!target.closest('[data-sheet-handle]')) {
        for (let node: Element | null = target; node; node = node === el ? null : node.parentElement) {
          if (node.scrollTop > 0) return;
        }
      }
      const touch = event.touches[0];
      drag = { x: touch.clientX, y: touch.clientY, dy: 0, at: event.timeStamp, velocity: 0, active: false };
    }

    function onMove(event: TouchEvent) {
      if (!drag) return;
      const touch = event.touches[0];
      const dx = touch.clientX - drag.x;
      const dy = touch.clientY - drag.y;
      if (!drag.active) {
        // Decided on the first move, before the browser commits to a scroll it
        // would no longer let us cancel: mostly-downward drags the sheet,
        // anything else is left to the page.
        if (dy <= 0 || dy < Math.abs(dx)) {
          drag = null;
          return;
        }
        drag.active = true;
        el!.style.transition = 'none';
        shade!.style.transition = 'none';
      }
      event.preventDefault();
      const elapsed = Math.max(1, event.timeStamp - drag.at);
      drag.velocity = (dy - drag.dy) / elapsed;
      drag.dy = dy;
      drag.at = event.timeStamp;
      const y = Math.max(0, dy);
      el!.style.translate = `0 ${y}px`;
      shade!.style.opacity = String(Math.max(0, 1 - y / el!.offsetHeight));
    }

    function onEnd(event: TouchEvent) {
      if (!drag?.active) {
        drag = null;
        return;
      }
      const dismiss = event.type === 'touchend' && (drag.dy > CLOSE_DISTANCE || drag.velocity > CLOSE_VELOCITY);
      drag = null;
      // Cleared before the close renders, so the transition starts from where the
      // finger let go: React commits this update in a microtask, ahead of the
      // next style recalculation.
      reset();
      if (dismiss) close();
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    // Not passive: an active drag cancels the scroll it would otherwise start.
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <>
      <div
        ref={backdrop}
        aria-hidden="true"
        data-open={open || undefined}
        onClick={onClose}
        className="pointer-events-none fixed inset-0 z-40 touch-none bg-black/60 opacity-0 transition-opacity duration-300 data-open:pointer-events-auto data-open:opacity-100 motion-reduce:transition-none lg:hidden"
      />
      <div
        ref={sheet}
        data-open={open || undefined}
        onTransitionEnd={(event) => {
          if (!open && event.target === event.currentTarget) onClosed();
        }}
        className={[
          // Phone: a sheet off the bottom edge, leaving a strip of the grid above
          // it so it reads as something that can be pushed back down.
          'invisible fixed inset-x-0 bottom-0 z-40 h-[calc(100dvh-max(2.5rem,env(safe-area-inset-top)+1rem))] translate-y-full overflow-hidden rounded-t-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.5)]',
          'transition-[translate,visibility] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-open:visible data-open:translate-y-0',
          // lg up: a column that widens from nothing. The panel inside keeps its
          // full width and sits at the right edge, so opening slides it in rather
          // than reflowing it at every step.
          'lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-dvh lg:w-0 lg:shrink-0 lg:translate-y-0 lg:justify-end lg:rounded-none lg:shadow-none',
          'lg:transition-[width,visibility] lg:duration-300 lg:data-open:w-(--inspector-w)',
          // The resizer writes the width on every pointermove; easing each write would make the drag lag.
          'motion-reduce:transition-none lg:in-data-resizing:transition-none lg:motion-reduce:transition-none',
        ].join(' ')}
      >
        {children}
      </div>
    </>
  );
}
