'use client';

import { useState } from 'react';
import { Polaroid, type PolaroidPhoto } from './Polaroid';
import { Lightbox } from './Lightbox';

/**
 * Justified rows via plain flex-wrap: each polaroid's flex-basis is proportional
 * to its aspect ratio, so a row grows its items to fill the width. Order comes in
 * already sorted by colour — see sortPhotosForWall.
 */

/** Gap between one frame's arrival and the next. */
const STAGGER_STEP_MS = 45;

/**
 * Ceiling on the whole sequence. Without it the delay scales with the photo
 * count, and a wall of sixty would leave the last frames arriving four seconds
 * after the first — long past the point where it reads as staging rather than a
 * page still loading. Past the cap the remaining frames arrive together.
 */
const STAGGER_MAX_MS = 450;
export function PolaroidWall({ photos }: { photos: PolaroidPhoto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return <p className="text-sm text-ash">No photos match these filters.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-5">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            aria-label={`Open ${photo.location} full screen`}
            onClick={() => setOpenIndex(index)}
            className="wall-item max-w-full text-left"
            // The delay rides on a custom property so the keyframes stay in the
            // stylesheet; only the one per-item number comes from here.
            style={
              {
                '--stagger': `${Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`,
              } as React.CSSProperties
            }
          >
            <Polaroid photo={photo} />
          </button>
        ))}
      </div>
      {openIndex !== null ? (
        <Lightbox
          photos={photos}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      ) : null}
    </>
  );
}
