'use client';

import Link from 'next/link';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GateLoader, useGatedAsset, useGateHold } from '@/components/site/AssetGate';
import { CARD_PADDING, Polaroid, type PolaroidPhoto } from '@/components/stills/Polaroid';
import { justifyRows } from '@/lib/photo/justify';
import { OPEN_PHOTO_PARAM } from '@/lib/photo/lightbox-link';

/** Matches the row's gap-5, as the wall's own GAP does. */
const GAP = 20;

/**
 * Shorter than the wall's frames: this is a glance, not the wall. A phone gets
 * two rows rather than one row of shorter frames — below about 160px a frame is
 * too narrow for its caption, which wraps and leaves that card taller than its
 * neighbours.
 */
const TARGET_HEIGHT = 220;
const NARROW_TARGET_HEIGHT = 160;
const NARROW_BELOW = 800;
const NARROW_ROWS = 2;

/**
 * Below the image: the frame's bottom padding plus the two caption lines. Only
 * used to hold the strip's height open until it has been measured, so a guess a
 * few pixels out costs nothing but a small settle on hydration.
 */
const CAPTION_ALLOWANCE = 58;

/**
 * The newest stills as justified rows of the wall's own polaroids — the same
 * packing as /stills, cut off after the first row (two on a phone). Rows rather
 * than a fixed count: a row is complete at every width, where a fixed count
 * leaves a ragged end on one screen and an empty slot on another.
 *
 * Each frame opens that photo in the wall's lightbox rather than leading to a
 * page of its own; there is no per-photo page.
 *
 * Inside the home page's AssetGate: the frames hold their cascade until their
 * images are in, and the gate's loader sits over the strip meanwhile.
 */
export function PhotoStrip({ photos }: { photos: PolaroidPhoto[] }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  const narrow = width > 0 && width < NARROW_BELOW;
  const targetHeight = narrow ? NARROW_TARGET_HEIGHT : TARGET_HEIGHT;

  const placed = useMemo(() => {
    if (width === 0) return [];
    const rows = justifyRows(
      photos.map((photo) => ({
        id: photo.id,
        ratio: photo.height > 0 ? photo.width / photo.height : 1,
      })),
      width,
      { targetHeight, gap: GAP, padding: CARD_PADDING },
    );
    // Only complete rows: the packing leaves the last one at the target height
    // rather than stretched, so a short final row would end ragged.
    const complete = rows.length > 1 ? rows.slice(0, -1) : rows;
    return complete.slice(0, narrow ? NARROW_ROWS : 1).flat();
  }, [photos, width, targetHeight, narrow]);

  const byId = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);

  // Until measured there are no frames to register, and a gate with nothing
  // registered would open on the spot.
  useGateHold(placed.length === 0);

  return (
    <div
      ref={stripRef}
      className="relative flex flex-wrap items-start gap-5"
      // Held open before measurement so the sections below do not jump up and
      // back down when the row arrives.
      style={{ minHeight: placed.length === 0 ? TARGET_HEIGHT + CAPTION_ALLOWANCE : undefined }}
    >
      <GateLoader />
      {placed.map((item, index) => {
        const photo = byId.get(item.id);
        if (!photo) return null;
        return (
          <StripFrame
            key={item.id}
            photo={photo}
            width={item.width}
            height={item.height}
            index={index}
          />
        );
      })}
    </div>
  );
}

/** One frame, as its own component so it can count itself into the gate. */
function StripFrame({
  photo,
  width,
  height,
  index,
}: {
  photo: PolaroidPhoto;
  width: number;
  height: number;
  index: number;
}) {
  const onSettled = useGatedAsset();
  return (
    <Link
      href={`/stills?${OPEN_PHOTO_PARAM}=${encodeURIComponent(photo.id)}`}
      className="stagger-in block"
      style={{ '--stagger': `${index * 45}ms` } as React.CSSProperties}
    >
      <Polaroid
        photo={photo}
        height={height}
        width={width}
        priority={index < 3}
        onSettled={onSettled}
      />
    </Link>
  );
}
