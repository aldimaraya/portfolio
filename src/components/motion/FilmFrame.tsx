'use client';

import { useEffect, useRef, useState } from 'react';
import { SpritePreview } from './SpritePreview';

export interface FrameVideo {
  id: string;
  videoUrl: string;
  posterImageUrl: string;
  spriteUrl: string;
  spriteFrames: number;
  width: number;
  height: number;
  title: string;
  description: string;
}

/**
 * Used when a clip predates stored dimensions. 16:9 is the shape those frames
 * were already being forced into, so an old clip looks no worse than before.
 */
const FRAME_FALLBACK_RATIO = 16 / 9;

export function frameRatio(video: Pick<FrameVideo, 'width' | 'height'>): number {
  if (video.width > 0 && video.height > 0) return video.width / video.height;
  return FRAME_FALLBACK_RATIO;
}

/**
 * Tallest a frame may stand. Filling the strip's width is fine for a landscape
 * clip but not a vertical one — 9:16 across the full width would be some 1460px
 * tall, taller than the strip itself, so a single frame would swallow the roll.
 * Applied as a max-width derived from the ratio rather than a max-height, since
 * clamping the height alone leaves the width at 100% and re-stretches the frame.
 */
const FRAME_MAX_HEIGHT = 480;

/** Sizes a frame's media box from the clip's own shape. */
export function frameBoxStyle(video: Pick<FrameVideo, 'width' | 'height'>): React.CSSProperties {
  const ratio = frameRatio(video);
  return { aspectRatio: ratio, maxWidth: FRAME_MAX_HEIGHT * ratio };
}

/** Matches the stills wall, so the two pages assemble at the same rhythm. */
const STAGGER_STEP_MS = 45;
const STAGGER_MAX_MS = 450;

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
      // An explicit play() rather than the autoPlay attribute, because which
      // clip runs is FilmStrip's decision: autoPlay would start a clip the
      // moment it mounted, regardless of whether it holds the playing slot.
      //
      // This is not what made clips play silently — that was uncompressed PCM
      // audio in the uploaded .mov files, which no browser can decode. See
      // lib/video/audio.ts, which now warns about it at upload time.
      element.play().catch(() => {
        // Rejection just leaves it paused with its controls showing; the user
        // can press play. Nothing here is worth an error state.
      });
    } else {
      element.pause();
    }
  }, [playing]);

  return (
    <article
      className="stagger-in mx-auto mb-20 w-[calc(100%-140px)] rounded-sm border border-goldline bg-frame p-3 pb-4 shadow-[0_8px_24px_rgba(0,0,0,0.6)] max-strip:w-[calc(100%-40px)]"
      style={
        { '--stagger': `${Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms` } as React.CSSProperties
      }
    >
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
          style={frameBoxStyle(video)}
          className="mx-auto w-full bg-black"
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
            boxStyle={frameBoxStyle(video)}
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
