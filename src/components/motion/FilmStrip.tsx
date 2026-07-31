'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FilmFrame, type FrameVideo } from './FilmFrame';
import { RollIndex } from './RollIndex';

/**
 * The reel transports on page scroll: a tall track holds a sticky viewport, and
 * scroll progress through the track maps to a translateY of the frames inside it.
 * Reading window.scrollY rather than an IntersectionObserver is what lets the
 * spool rotation, the sprocket holes and the frame offset stay in lockstep — they
 * are three readings of one number.
 */

/** Height of one sprocket hole cell, so the holes scroll with the film. */
const SPROCKET_PITCH = 32;

/**
 * The current frame is whichever sits nearest the middle of the window.
 *
 * Measuring from the top edge instead cannot reach the end of the roll: the film
 * stops travelling once its last frame's bottom meets the strip's bottom, so on a
 * strip taller than one frame the final frame comes to rest below any fixed line
 * near the top and never becomes current. Reading from the centre has no such
 * dead zone at either end, whatever the strip height or frame count.
 */
function distanceFromCentre(child: HTMLElement, position: number, stripHeight: number): number {
  const centre = child.offsetTop + child.offsetHeight / 2 - position;
  return Math.abs(centre - stripHeight / 2);
}

/** Scroll distance allotted per clip. Lower feels rushed, higher feels stuck. */
const TRACK_VH_PER_VIDEO = 200;

export function FilmStrip({ videos }: { videos: FrameVideo[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<HTMLDivElement>(null);
  const spoolRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Which clip is playing, if any. Held here rather than per frame so starting
  // one stops the rest — two clips playing at once means two soundtracks.
  const [playingId, setPlayingId] = useState<string | null>(null);

  /** Distance the frames must travel for the last one to clear the window. */
  const travel = useCallback(() => {
    const frames = framesRef.current;
    const strip = stripRef.current;
    if (!frames || !strip) return 1;
    return Math.max(1, frames.scrollHeight - strip.clientHeight + 100);
  }, []);

  /** Scroll distance available inside the track while the viewport is stuck. */
  const maxScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 1;
    return Math.max(1, track.clientHeight - window.innerHeight);
  }, []);

  useEffect(() => {
    function onScroll() {
      const track = trackRef.current;
      const frames = framesRef.current;
      const strip = stripRef.current;
      if (!track || !frames || !strip) return;

      const progressed = window.scrollY - track.offsetTop;
      // Above the track: the strip is still parked at its first frame.
      if (progressed < 0) return;

      const ratio = Math.min(Math.max(progressed / maxScroll(), 0), 1);
      const offset = -(ratio * travel());

      frames.style.transform = `translateY(${offset}px)`;

      // Modulo the pitch, so the holes cycle rather than sliding off with the film.
      const sprocket = offset % SPROCKET_PITCH;
      strip.style.backgroundPosition = `18px ${sprocket}px, calc(100% - 18px) ${sprocket}px`;

      if (spoolRef.current) {
        spoolRef.current.style.transform = `rotate(${ratio * 1080}deg)`;
      }

      const position = Math.abs(offset);
      let next = 0;
      let nearest = Infinity;
      (Array.from(frames.children) as HTMLElement[]).forEach((child, index) => {
        const distance = distanceFromCentre(child, position, strip.clientHeight);
        if (distance < nearest) {
          nearest = distance;
          next = index;
        }
      });
      setActiveIndex(next);
    }

    // Once up front: a reload partway down the page must not start at frame one.
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [maxScroll, travel]);

  function jumpToFrame(index: number) {
    const track = trackRef.current;
    const frames = framesRef.current;
    const strip = stripRef.current;
    if (!track || !frames || !strip) return;
    const child = frames.children[index] as HTMLElement | undefined;
    if (!child) return;

    // Invert the mapping above, centring the frame rather than aligning its top —
    // landing anywhere else would leave the roll index highlighting a different
    // frame than the one just clicked.
    const wanted = child.offsetTop + child.offsetHeight / 2 - strip.clientHeight / 2;
    const ratio = Math.min(Math.max(wanted / travel(), 0), 1);
    window.scrollTo({ top: track.offsetTop + ratio * maxScroll(), behavior: 'smooth' });
  }

  if (videos.length === 0) {
    return <p className="text-sm text-ash">No clips yet.</p>;
  }

  return (
    <div
      ref={trackRef}
      className="relative"
      style={{ height: `${videos.length * TRACK_VH_PER_VIDEO}vh` }}
    >
      <div className="sticky top-5 flex h-[85vh] w-full gap-6 max-strip:h-auto max-strip:flex-col">
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mb-3 flex items-center gap-3 font-mono text-xs tracking-[0.1em] text-gold uppercase">
            <div ref={spoolRef} className="relative h-6 w-6 rounded-full border-2 border-gold">
              <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-gold" />
              <span className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-gold" />
            </div>
            <span>Transport mechanism</span>
          </div>

          <div
            ref={stripRef}
            className="relative h-full w-full overflow-hidden rounded border border-hairline bg-film shadow-[0_20px_50px_rgba(0,0,0,0.9)]"
            // Sprocket holes as two repeating radial gradients rather than an
            // asset: one paint, and the scroll handler only moves their position.
            style={{
              backgroundImage:
                'radial-gradient(circle, var(--color-ink) 40%, transparent 45%), radial-gradient(circle, var(--color-ink) 40%, transparent 45%)',
              backgroundPosition: '18px 0px, calc(100% - 18px) 0px',
              backgroundSize: `20px ${SPROCKET_PITCH}px`,
              backgroundRepeat: 'repeat-y',
            }}
          >
            <div ref={framesRef} className="absolute inset-x-0 top-0 pt-10 will-change-transform">
              {videos.map((video, index) => (
                <FilmFrame
                  key={video.id}
                  video={video}
                  index={index}
                  active={index === activeIndex}
                  playing={video.id === playingId}
                  onPlay={() => setPlayingId(video.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <RollIndex
          titles={videos.map((video) => video.title)}
          activeIndex={activeIndex}
          onJump={jumpToFrame}
        />
      </div>
    </div>
  );
}
