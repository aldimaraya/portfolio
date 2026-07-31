'use client';

import { useEffect, useRef, useState } from 'react';
import { SpritePreview } from './SpritePreview';

export interface FrameVideo {
  id: string;
  videoUrl: string;
  posterImageUrl: string;
  spriteUrl: string;
  spriteFrames: number;
  title: string;
  description: string;
}

/** `01A`, `02A`, … — the frame numbering printed along a real strip. */
function frameCode(index: number): string {
  return `${String(index + 1).padStart(2, '0')}A`;
}

export function FilmFrame({
  video,
  index,
  active,
  playing,
  onPlay,
}: {
  video: FrameVideo;
  index: number;
  active: boolean;
  /** Owned by FilmStrip: one clip plays at a time, so this cannot be local state. */
  playing: boolean;
  onPlay: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Sticky: once a clip has been started it keeps its element, so switching away
  // and back resumes where it stopped rather than restarting from zero.
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    if (playing) {
      // An explicit play() rather than the autoPlay attribute. autoPlay hands
      // the decision to the browser's autoplay policy, which grants sound at
      // its own discretion -- in practice the first clip played with audio and
      // every later one was silently muted, leaving a video whose own unmute
      // button could not fix it.
      element.play().catch(() => {
        // Rejection just leaves it paused with its controls showing; the user
        // can press play. Nothing here is worth an error state.
      });
    } else {
      element.pause();
    }
  }, [playing]);

  return (
    <article className="mx-auto mb-20 w-[calc(100%-140px)] rounded-sm border border-goldline bg-frame p-3 pb-4 shadow-[0_8px_24px_rgba(0,0,0,0.6)] max-strip:w-[calc(100%-40px)]">
      <div className="mb-2 flex justify-between font-mono text-[0.7rem] font-semibold tracking-[0.08em] text-gold uppercase">
        <span>{playing ? '● Playing' : opened ? '❚❚ Paused' : '▶ Preview'}</span>
        <span>Frame {frameCode(index)}</span>
      </div>

      {opened ? (
        // Mounted from the first play onwards, never before: an untouched page
        // of clips costs one sprite sheet each rather than N video elements
        // fetching metadata.
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.posterImageUrl}
          title={video.title}
          // Claims the single playing slot whenever playback starts, including
          // from the native controls. Without this, pressing play on a paused
          // clip would leave two soundtracks running.
          onPlay={onPlay}
          controls
          preload="metadata"
          playsInline
          className="aspect-video w-full bg-black"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpened(true);
            onPlay();
          }}
          className="group relative block w-full"
          aria-label={`Play ${video.title}`}
        >
          <SpritePreview
            spriteUrl={video.spriteUrl}
            frames={video.spriteFrames}
            active={active}
            alt={video.title}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-gold/70 bg-ink/60 px-4 py-2 font-mono text-xs tracking-[0.1em] text-gold uppercase opacity-0 transition group-hover:opacity-100">
              Play
            </span>
          </span>
        </button>
      )}

      <div className="mt-2.5 flex items-start justify-between gap-4">
        <div className="text-sm font-bold tracking-[0.04em] uppercase">{video.title}</div>
        {video.description ? (
          <div className="text-right font-mono text-[0.65rem] leading-tight tracking-[0.05em] text-gold uppercase">
            {video.description}
          </div>
        ) : null}
      </div>
    </article>
  );
}
