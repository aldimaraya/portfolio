'use client';

import { useState } from 'react';
import { Polaroid, type PolaroidPhoto } from './Polaroid';
import { Lightbox } from './Lightbox';

/**
 * Justified rows via plain flex-wrap: each polaroid's flex-basis is proportional
 * to its aspect ratio, so a row grows its items to fill the width. Order comes in
 * already sorted by colour — see sortPhotosForWall.
 */
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
            className="max-w-full text-left"
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
