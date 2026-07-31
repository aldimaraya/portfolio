import Image from 'next/image';
import { summarizeSettings, type PhotoSettings } from '@/lib/photo/settings';

export interface PolaroidPhoto {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  location: string;
  camera: string;
  settings: PhotoSettings;
}

/**
 * Every frame is this tall, so a row's photos line up along the bottom of their
 * images and each card's width follows from its own aspect ratio.
 */
const FRAME_HEIGHT = 300;

/** p-2.5 either side of the image. */
const CARD_PADDING = 20;

export function Polaroid({ photo }: { photo: PolaroidPhoto }) {
  const ratio = photo.height > 0 ? photo.width / photo.height : 1;
  const caption = [photo.camera, summarizeSettings(photo.settings)].filter(Boolean).join(' · ');

  return (
    <article
      className="flex max-w-full flex-col rounded-sm border border-goldline bg-frame p-2.5 pb-3.5 shadow-[0_6px_18px_rgba(0,0,0,0.5)] transition hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.7)]"
      // Width derived from the photo's own ratio rather than grown to fill the
      // row. Letting flex justify the row distorts the frame whenever a row is
      // short — a single landscape photo would stretch across the full width and
      // object-cover would crop most of it away.
      style={{ width: FRAME_HEIGHT * ratio + CARD_PADDING }}
    >
      <div
        className="relative overflow-hidden bg-black"
        style={{ height: FRAME_HEIGHT }}
      >
        <Image
          src={photo.imageUrl}
          alt={photo.location}
          fill
          sizes={`${Math.round(FRAME_HEIGHT * ratio)}px`}
          className="object-cover"
        />
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="text-xs font-bold tracking-[0.04em] uppercase">{photo.location}</div>
        {caption ? (
          <div className="mt-0.5 truncate font-mono text-[0.65rem] leading-tight tracking-[0.05em] text-gold uppercase">
            {caption}
          </div>
        ) : null}
      </div>
    </article>
  );
}
