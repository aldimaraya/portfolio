'use client';

import { useEffect, useRef, useState } from 'react';
import { frameCode } from '@/lib/video/roll';
import { frameRatio, gateStyles } from '@/lib/video/frame';
import { youtubeWatchUrl } from '@/lib/markdown/media';

export interface StageClip {
  videoUrl: string;
  posterImageUrl: string;
  width: number;
  height: number;
  title: string;
  /** Empty when the clip has no full-resolution copy on YouTube. */
  youtubeId: string;
}

/**
 * The projector gate: one clip, at the size it was shot, running on arrival.
 *
 * Autoplay is a request, not a guarantee — every browser refuses it for a clip
 * with sound until the visitor has interacted with the site, and iOS refuses it
 * outright on a metered connection with Low Power Mode on. So playback is
 * started by hand from an effect rather than by the `autoPlay` attribute: the
 * attribute gives no way to find out that it was denied, which is exactly the
 * case that has to be handled. On refusal the poster stays up with a play
 * control over it, which is what the visitor needs anyway.
 *
 * Deliberately not muted-to-force-it. A silent autoplay always succeeds, so it
 * would look like the better default, but these clips are graded and mixed —
 * starting one silently and letting the visitor discover the sound later is a
 * worse first impression than one that waits for a click.
 */
export function ClipStage({
  clip,
  index,
  letter,
}: {
  clip: StageClip;
  index: number;
  letter: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // Whether the clip has ever run. Both states are set from the element's own
  // events rather than from the attempt below, which is what lets one flag cover
  // every reason the clip might be sitting on its poster — autoplay refused,
  // reduced motion honoured, or the visitor having paused it themselves.
  const [started, setStarted] = useState(false);
  // The stored dimensions shape the gate before the file has said anything, so
  // nothing jumps on load — but a clip uploaded before width/height were stored
  // carries 0×0 and is shaped by FRAME_FALLBACK_RATIO's guess, which mattes a
  // 4:3 frame inside a 16:9 box. The element knows the real answer as soon as it
  // has metadata, and it is a better source than the row: it is the file.
  const [measured, setMeasured] = useState<number | null>(null);
  // Theater mode: the gate lifted out of the page to fill the window. Not the
  // native fullscreen, which the player already offers — this keeps the slate
  // and the site's own frame, and does not ask the OS for anything.
  const [theater, setTheater] = useState(false);

  // One ratio, two styles — the panel is sized by it, the frame is shaped by it.
  const gate = gateStyles(measured ?? frameRatio(clip));

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    // Autoplaying video is motion in the strongest sense, and this site treats
    // the preference as off rather than gentler everywhere else — the sprite
    // previews stop dead, the projector parks. Honouring it here costs a click
    // and keeps that rule whole.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Nothing to do on refusal: the poster and the play control are already
    // what the visitor is looking at, because `started` is still false.
    element.play().catch(() => {});
  }, []);

  // `t` toggles, as it does on the players people already know; Escape leaves.
  // Ignored while typing, and with a modifier held, so it never eats a browser
  // shortcut or a letter meant for a field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return;

      if (event.key === 't' || event.key === 'T') setTheater((on) => !on);
      else if (event.key === 'Escape') setTheater(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The page behind keeps its scroll position but must not scroll under the
  // overlay — a wheel over the frame would otherwise move a page nobody can see.
  useEffect(() => {
    if (!theater) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [theater]);

  return (
    <div
      data-playing={playing ? 'true' : 'false'}
      data-theater={theater ? 'true' : 'false'}
      // The panel carries the size budget, so the gate closes around the clip
      // rather than framing a small frame in a wide empty surround. The ratio
      // published here is what .clip-gate turns into a width, and what
      // .clip-theater turns into one against the whole window.
      style={gate.panel}
      className={
        theater
          ? // Above the header and the newsletter prompt (z-50).
            'clip-stage clip-theater fixed inset-0 z-[60] flex flex-col bg-black p-4'
          : 'clip-stage clip-gate mx-auto rounded-sm border border-goldline bg-frame p-3 pb-3.5'
      }
    >
      <div className="mb-2 flex items-center justify-between font-mono text-[0.7rem] font-semibold tracking-[0.08em] text-gold uppercase">
        <span className="flex items-center gap-2.5">
          {/* The same ring-and-cross as the head of the roll: one mechanism,
              shown here doing the thing it does when there is film running. */}
          <span className="spool-gate relative block h-[15px] w-[15px] rounded-full border-[1.5px] border-gold">
            <span className="absolute top-1/2 right-px left-px h-px -translate-y-1/2 bg-gold" />
            <span className="absolute top-px bottom-px left-1/2 w-px -translate-x-1/2 bg-gold" />
          </span>
          <span>{playing ? 'Projecting' : started ? 'Paused' : 'Ready'}</span>
        </span>
        <span className="flex items-center gap-4">
          <span>Frame {frameCode(index, letter)}</span>
          {/* A link out, not an embedded YouTube player: the gate keeps playing
              our own file, so the page stays free of third-party scripts and
              cookies until the visitor chooses to go. The local clip is paused
              on the way out, or it would carry on playing to an empty tab. */}
          {clip.youtubeId ? (
            <a
              href={youtubeWatchUrl(clip.youtubeId)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => videoRef.current?.pause()}
              title="Watch the full-resolution version on YouTube"
              className="text-ash uppercase transition hover:text-gold"
            >
              4K ↗
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setTheater((on) => !on)}
            aria-pressed={theater}
            title={
              theater ? 'Leave theater mode (t or Esc)' : 'Theater mode (t)'
            }
            className="flex items-center gap-1.5 text-ash uppercase transition hover:text-gold"
          >
            <TheaterIcon />
            {theater ? 'Exit theater' : 'Theater'}
          </button>
        </span>
      </div>

      {/* In theater the frame is centred in whatever height the slate leaves;
          outside it this wrapper is an ordinary block and changes nothing. */}
      <div
        className={
          theater
            ? 'flex min-h-0 flex-1 items-center justify-center'
            : undefined
        }
      >
        <div className="clip-frame relative w-full" style={gate.frame}>
          <video
            ref={videoRef}
            src={clip.videoUrl}
            poster={clip.posterImageUrl}
            title={clip.title}
            controls
            // The clip is meant to start on its own, so its first seconds are
            // wanted immediately — `metadata` would leave the gate empty while
            // the opening play() waits on data that was never asked for.
            preload="auto"
            playsInline
            onLoadedMetadata={(event) => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth > 0 && videoHeight > 0) {
                setMeasured(videoWidth / videoHeight);
              }
            }}
            // Both states come from the element rather than from the click that
            // caused them, so the native controls and a clip reaching its end move
            // the spool too.
            onPlay={() => {
              setPlaying(true);
              setStarted(true);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="h-full w-full bg-black"
          />

          {/* Up until the clip first runs, whatever the reason it has not. Once it
            has, the native controls own starting and stopping it. */}
          {!started ? (
            <button
              type="button"
              onClick={() => videoRef.current?.play().catch(() => {})}
              // Sits clear of the native control bar along the bottom, so the one
              // that starts the clip is not covering the one that scrubs it.
              className="absolute inset-x-0 top-0 bottom-12 flex items-center justify-center"
              aria-label={`Play ${clip.title}`}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/70 bg-ink/60 pl-1 text-xl text-gold transition hover:bg-ink/80">
                ▶
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A wide screen with a stage under it — the frame, made bigger. */
function TheaterIcon() {
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="0.75"
        y="0.75"
        width="12.5"
        height="6.5"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 9.25h8' stroke='currentColor' strokeWidth='1.5" />
    </svg>
  );
}
