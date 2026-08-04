'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SpritePreview } from './SpritePreview';
import { frameCode } from './FilmRail';
import { thumbWidth } from '@/lib/video/frame';
import { formatDuration } from '@/lib/video/duration';

export interface RollClip {
  id: string;
  spriteUrl: string;
  spriteFrames: number;
  width: number;
  height: number;
  /** 0 for clips stored before the column existed — rendered as nothing. */
  durationSeconds: number;
  title: string;
  description: string;
}

/** Matches the stills wall, so the two pages assemble at the same rhythm. */
const STAGGER_STEP_MS = 45;
const STAGGER_MAX_MS = 220;

/**
 * Every row is this tall, whatever shape the clip is — the list scans as a
 * column of equal beats, and a vertical clip is laid out narrow rather than
 * three times as tall as its neighbours. See thumbWidth.
 */
const THUMB_HEIGHT = 72;

/**
 * The column the thumbnails sit in: as wide as a landscape clip at that height,
 * so a portrait clip is centred in the same column rather than shifting every
 * title beside it left.
 */
const THUMB_COLUMN = thumbWidth({ width: 16, height: 9 }, THUMB_HEIGHT);

/**
 * One clip on the roll.
 *
 * The sprite sheet built at upload time survives the redesign, but it no longer
 * runs unprompted: six looping previews down a list is ambient motion competing
 * for attention, where one that starts under the cursor is an answer to a
 * question the visitor just asked. Reduced motion still stops it dead — the
 * rule in globals.css pins every strip back to frame one regardless of this.
 */
export function ClipRow({ clip, index }: { clip: RollClip; index: number }) {
  const [previewing, setPreviewing] = useState(false);
  const runtime = formatDuration(clip.durationSeconds);

  return (
    <Link
      href={`/motion/${clip.id}`}
      // The whole row is the target, not the title inside it: a 15px link in a
      // 72px row is a small thing to hit on a phone.
      className="stagger-in group flex items-center gap-5 px-4 py-3.5 transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none max-strip:gap-3.5 max-strip:px-3 max-strip:py-3"
      style={
        {
          '--stagger': `${Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`,
        } as React.CSSProperties
      }
      onMouseEnter={() => setPreviewing(true)}
      onMouseLeave={() => setPreviewing(false)}
      onFocus={() => setPreviewing(true)}
      onBlur={() => setPreviewing(false)}
    >
      {/* Fixed-width box around the thumbnail rather than the thumbnail itself:
          a portrait clip is narrower than a landscape one, and without a shared
          column the titles beside them would not line up. */}
      <span className="flex shrink-0 justify-center" style={{ width: THUMB_COLUMN }}>
        <SpritePreview
          spriteUrl={clip.spriteUrl}
          frames={clip.spriteFrames}
          active={previewing}
          // Decorative: the title sits next to it in the same link, so naming
          // the clip here would have a screen reader read it out twice.
          alt=""
          boxStyle={{ width: thumbWidth(clip, THUMB_HEIGHT), height: THUMB_HEIGHT }}
          className="rounded-xs border border-goldline transition-colors group-hover:border-gold group-focus-visible:border-gold"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold tracking-[0.04em] uppercase">
          {clip.title}
        </span>
        {clip.description ? (
          <span className="mt-1 block truncate font-mono text-[0.7rem] tracking-[0.05em] text-ash">
            {clip.description}
          </span>
        ) : null}
      </span>

      {/* The frame code is the roll's own numbering and goes on a narrow screen;
          the running time is what anyone deciding whether to watch actually
          wants, so it stays at every width. */}
      <span className="flex shrink-0 items-baseline gap-2.5 font-mono text-[0.7rem] tracking-[0.08em] tabular-nums">
        <span className="text-gold max-strip:hidden">[{frameCode(index)}]</span>
        {runtime ? <span className="text-ash">{runtime}</span> : null}
      </span>
    </Link>
  );
}
