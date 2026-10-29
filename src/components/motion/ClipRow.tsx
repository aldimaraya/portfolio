'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SpritePreview } from './SpritePreview';
import { useGatedAsset } from '@/components/site/AssetGate';
import { frameRatio } from '@/lib/video/frame';
import { formatDuration } from '@/lib/video/duration';
import { frameCode } from '@/lib/video/roll';

export interface RollClip {
  id: string;
  spriteUrl: string;
  /** Frame one of the sheet, shown until a preview is asked for — see SpritePreview. */
  posterImageUrl: string;
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
 * Every row's thumbnail is `--thumb-h` tall, whatever shape the clip is — the
 * list scans as a column of equal beats, and a vertical clip is laid out narrow
 * rather than three times as tall as its neighbours. The width is the clip's
 * ratio times that height.
 *
 * A custom property rather than a number in JS because the height changes at
 * the strip breakpoint, and only CSS knows which side of it the page is on: the
 * desktop row has room for a thumbnail a visitor can actually read, but at that
 * size a phone would be left with a hundred pixels for the title.
 */
const THUMB_HEIGHT = 'var(--thumb-h)';

/**
 * The widest shape a thumbnail takes, and so the column they all sit in: a
 * portrait clip is centred in the same column as a landscape one rather than
 * shifting every title beside it left.
 */
const THUMB_COLUMN_RATIO = 16 / 9;

/**
 * One clip on the roll.
 *
 * The sprite sheet built at upload time survives the redesign, but it no longer
 * runs unprompted: six looping previews down a list is ambient motion competing
 * for attention, where one that starts under the cursor is an answer to a
 * question the visitor just asked. Reduced motion still stops it dead — the
 * rule in globals.css pins every strip back to frame one regardless of this.
 */
export function ClipRow({
  clip,
  index,
  letter,
  gated = false,
}: {
  clip: RollClip;
  /** Position on its own roll, not on the page — frame codes restart per roll. */
  index: number;
  letter: string;
  /**
   * Whether the enclosing AssetGate waits for this row's poster. Only the first
   * rows on a page: the posters are lazy, and one far below the fold is not
   * fetched until it is scrolled to, so waiting on it would hold the page to the
   * gate's cap.
   */
  gated?: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  // A hand-picked cover is the thumbnail, so the box takes the cover's shape
  // rather than the clip's — shaped from the clip, a 16:9 cover on a 4:3 clip
  // lost its edges to object-fit. No column stores a cover's size, so it is
  // read off the image once it lands; until then the clip's shape stands in.
  // Capped at the column, so a cover wider than 16:9 crops a little rather
  // than pushing the title out of line with its neighbours.
  const [posterRatio, setPosterRatio] = useState<number | null>(null);
  const onSettled = useGatedAsset(gated);
  const boxRatio = Math.min(posterRatio ?? frameRatio(clip), THUMB_COLUMN_RATIO);
  const runtime = formatDuration(clip.durationSeconds);

  return (
    <Link
      href={`/motion/${clip.id}`}
      // The whole row is the target, not the title inside it: a line of title in
      // a 72px row is a small thing to hit on a phone.
      className="stagger-in group flex items-center gap-6 px-4 py-4 transition-colors [--thumb-h:104px] hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none max-strip:gap-3.5 max-strip:px-3 max-strip:py-3 max-strip:[--thumb-h:72px]"
      style={
        {
          '--stagger': `${Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`,
        } as React.CSSProperties
      }
      // The router keeps this page's state across a visit to the clip, and the
      // click navigates away mid-hover, so no mouseleave ever arrives — coming
      // back found the row still previewing. Settle it on the way out.
      onClick={() => setPreviewing(false)}
      onMouseEnter={() => setPreviewing(true)}
      onMouseLeave={() => setPreviewing(false)}
      // Keyboard focus only. A clicked row keeps focus — and gets it back when
      // the visitor returns from the clip page — so plain focus left that row
      // previewing with no cursor anywhere near it.
      onFocus={(event) => {
        if (event.currentTarget.matches(':focus-visible')) setPreviewing(true);
      }}
      onBlur={() => setPreviewing(false)}
    >
      {/* Fixed-width box around the thumbnail rather than the thumbnail itself:
          a portrait clip is narrower than a landscape one, and without a shared
          column the titles beside them would not line up. */}
      <span
        className="flex shrink-0 justify-center"
        style={{ width: `calc(${THUMB_HEIGHT} * ${THUMB_COLUMN_RATIO})` }}
      >
        <SpritePreview
          spriteUrl={clip.spriteUrl}
          posterUrl={clip.posterImageUrl}
          frames={clip.spriteFrames}
          clipRatio={frameRatio(clip)}
          active={previewing}
          // Decorative: the title sits next to it in the same link, so naming
          // the clip here would have a screen reader read it out twice.
          alt=""
          onSettled={onSettled}
          onPosterRatio={setPosterRatio}
          boxStyle={{ width: `calc(${THUMB_HEIGHT} * ${boxRatio})`, height: THUMB_HEIGHT }}
          className="rounded-xs border border-goldline transition-colors group-hover:border-gold group-focus-visible:border-gold"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold tracking-[0.04em] uppercase max-strip:text-sm">
          {clip.title}
        </span>
        {clip.description ? (
          <span className="mt-1.5 block truncate font-mono text-xs tracking-[0.05em] text-ash max-strip:mt-1 max-strip:text-[0.7rem]">
            {clip.description}
          </span>
        ) : null}
      </span>

      {/* The frame code is the roll's own numbering and goes on a narrow screen;
          the running time is what anyone deciding whether to watch actually
          wants, so it stays at every width. */}
      <span className="flex shrink-0 items-baseline gap-2.5 font-mono text-xs tracking-[0.08em] tabular-nums max-strip:text-[0.7rem]">
        <span className="text-gold max-strip:hidden">[{frameCode(index, letter)}]</span>
        {runtime ? <span className="text-ash">{runtime}</span> : null}
      </span>
    </Link>
  );
}
