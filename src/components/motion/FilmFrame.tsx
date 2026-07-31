'use client';

import { useState } from 'react';
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
}: {
  video: FrameVideo;
  index: number;
  active: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <article className="mx-auto mb-20 w-[calc(100%-140px)] rounded-sm border border-goldline bg-frame p-3 pb-4 shadow-[0_8px_24px_rgba(0,0,0,0.6)] max-strip:w-[calc(100%-40px)]">
      <div className="mb-2 flex justify-between font-mono text-[0.7rem] font-semibold tracking-[0.08em] text-gold uppercase">
        <span>{playing ? '● Playing' : '▶ Preview'}</span>
        <span>Frame {frameCode(index)}</span>
      </div>

      {playing ? (
        // Mounted only once play is clicked, so a page of clips costs one sprite
        // sheet each rather than N video elements fetching metadata.
        <video
          src={video.videoUrl}
          poster={video.posterImageUrl}
          title={video.title}
          controls
          autoPlay
          preload="metadata"
          playsInline
          className="aspect-video w-full bg-black"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
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
