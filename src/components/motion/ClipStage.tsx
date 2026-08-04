'use client';

import { useEffect, useRef, useState } from 'react';
import { frameCode } from './FilmRail';
import { frameRatio, gateStyles } from '@/lib/video/frame';

export interface StageClip {
  videoUrl: string;
  posterImageUrl: string;
  width: number;
  height: number;
  title: string;
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
export function ClipStage({ clip, index }: { clip: StageClip; index: number }) {
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

  return (
    <div
      data-playing={playing ? 'true' : 'false'}
      // The panel carries the size budget, so the gate closes around the clip
      // rather than framing a small frame in a wide empty surround. The ratio
      // published here is what .clip-gate turns into a width.
      style={gate.panel}
      className="clip-stage clip-gate mx-auto rounded-sm border border-goldline bg-frame p-3 pb-3.5"
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
        <span>Frame {frameCode(index)}</span>
      </div>

      <div className="relative w-full" style={gate.frame}>
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
  );
}
