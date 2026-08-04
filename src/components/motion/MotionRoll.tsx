'use client';

import { useEffect, useRef } from 'react';
import { ClipRow, type RollClip } from './ClipRow';
import { FilmRail, PERFORATION_PITCH } from './FilmRail';

/**
 * The roll as a list.
 *
 * The film used to *be* the layout: a tall runway track, a sticky 85vh viewport,
 * and a translateY on the frames driven by window.scrollY. That is what made the
 * page scroll strangely on a phone — the transport competed with the browser's
 * own scrolling, and on iOS with the URL bar resizing mid-gesture as well.
 *
 * So the mechanism now *reports* motion instead of causing it. The rail's
 * perforations travel and the head spool turns, both read off the same scrollY,
 * but nothing is intercepted: delete the effect below and the page scrolls
 * exactly as it does with it.
 */

/**
 * Perforations per full turn of the head spool. The two are geared to each other
 * rather than tuned separately, so the spool reads as the thing pulling the film
 * past rather than an ornament spinning near it.
 */
const PERFORATIONS_PER_TURN = 6;

const DEGREES_PER_PIXEL = 360 / (PERFORATION_PITCH * PERFORATIONS_PER_TURN);

export function MotionRoll({ clips }: { clips: RollClip[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const spoolRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const spool = spoolRef.current;
    if (!rail || !spool) return;

    // Coalesced into one frame: scroll fires faster than the compositor paints,
    // and both writes are purely visual. Both are custom properties feeding a
    // transform and a background-position — no geometry is read, so this cannot
    // force a synchronous reflow in the middle of a gesture.
    let pending = false;

    function transport() {
      pending = false;
      const y = window.scrollY;
      // Modulo the pitch, so the holes cycle rather than sliding off the rail.
      rail!.style.setProperty('--perforation-offset', `${-y % PERFORATION_PITCH}px`);
      spool!.style.setProperty('--spool-turn', `${y * DEGREES_PER_PIXEL}deg`);
    }

    function onScroll() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(transport);
    }

    // Once up front, so a reload partway down the page does not leave the
    // mechanism parked at zero while the film is already halfway through.
    transport();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (clips.length === 0) {
    return <p className="text-sm text-ash">No clips yet.</p>;
  }

  return (
    <div className="flex">
      <FilmRail ref={railRef}>
        {/* Parked at the top of the rail while the roll runs past it, and inside
            the rail so it costs the row no width of its own. */}
        <div
          ref={spoolRef}
          className="spool-head sticky top-3 h-[26px] w-[26px] rounded-full border-[1.5px] border-gold bg-ink max-strip:h-4 max-strip:w-4"
        >
          <span className="absolute top-1/2 right-0.5 left-0.5 h-[1.5px] -translate-y-1/2 bg-gold" />
          <span className="absolute top-0.5 bottom-0.5 left-1/2 w-[1.5px] -translate-x-1/2 bg-gold" />
        </div>
      </FilmRail>

      <ul className="min-w-0 flex-1">
        {clips.map((clip, index) => (
          <li key={clip.id} className="border-b border-hairline first:border-t">
            <ClipRow clip={clip} index={index} />
          </li>
        ))}
      </ul>
    </div>
  );
}
