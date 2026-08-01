'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { summarizeSettings } from '@/lib/photo/settings';
import type { PolaroidPhoto } from './Polaroid';

interface LightboxProps {
  photos: PolaroidPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function Lightbox({ photos, index, onClose, onNavigate }: LightboxProps) {
  const photo = photos[index];
  /**
   * The overlay has to outlive the decision to close it, or there is nothing
   * left on screen to animate. Every dismissal sets this instead of unmounting,
   * and the animation's own end event is what finally calls onClose.
   */
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => setClosing(true), []);

  // Wrapping keeps the arrows live at both ends, so holding a key never leaves
  // you stuck on the last frame wondering whether the control broke.
  const step = useCallback(
    (delta: number) => onNavigate((index + delta + photos.length) % photos.length),
    [index, photos.length, onNavigate],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose();
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
      else return;
      event.preventDefault();
    }

    document.addEventListener('keydown', onKeyDown);
    // The wall behind the overlay must not scroll while the lightbox owns the
    // arrow keys.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose, step]);

  if (!photo) return null;

  const caption = [photo.camera, summarizeSettings(photo.settings)].filter(Boolean).join(' · ');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.location}
      // zoom-out on the backdrop, default over the photo itself — the cursor
      // tells you which regions dismiss and which do not.
      className="lightbox fixed inset-0 z-50 flex cursor-zoom-out flex-col bg-black/95 backdrop-blur-sm"
      data-closing={closing ? 'true' : undefined}
      onClick={requestClose}
      // Scoped to this element: the entry animation on a child would otherwise
      // bubble up here and tear the overlay down the moment it opened.
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-5 py-4 text-xs">
        <div className="font-mono tracking-[0.05em] text-ash">
          {index + 1} / {photos.length}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="px-2 py-1 text-lg leading-none text-ash transition hover:text-gold"
        >
          ✕
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        <NavButton side="left" disabled={photos.length < 2} onClick={() => step(-1)} />
        <div
          className="relative h-full w-full cursor-default"
          // Clicks on the photo itself shouldn't dismiss — only the backdrop.
          onClick={(event) => event.stopPropagation()}
        >
          <Image
            key={photo.id}
            src={photo.imageUrl}
            alt={photo.location}
            fill
            sizes="100vw"
            priority
            className="object-contain"
          />
        </div>
        <NavButton side="right" disabled={photos.length < 2} onClick={() => step(1)} />
      </div>

      <div className="px-5 py-5 text-center">
        <div className="text-sm font-bold tracking-[0.04em] uppercase">{photo.location}</div>
        {caption ? (
          <div className="mt-1 font-mono text-[0.7rem] tracking-[0.05em] text-gold uppercase">
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  if (disabled) return null;

  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`absolute ${side === 'left' ? 'left-2' : 'right-2'} z-10 flex h-12 w-12 items-center justify-center rounded-full bg-frame/70 text-2xl text-ash transition hover:bg-frame hover:text-gold`}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}
