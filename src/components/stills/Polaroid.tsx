import Image from 'next/image';
import { summarizeSettings, type PhotoSettings } from '@/lib/photo/settings';
import { placeholderColor } from '@/lib/color/analyze';
import { formatTakenAt } from '@/lib/photo/date';

export interface PolaroidPhoto {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  location: string;
  camera: string;
  settings: PhotoSettings;
  /** Colour stats from upload — the wall sorts by them, the frame paints with them. */
  avgHue: number;
  avgChroma: number;
  avgLightness: number;
  warmth: number;
  isMonochrome: boolean;
  /** Null for most of the library — see Photo.takenAt in schema.prisma. */
  takenAt: Date | null;
}

/**
 * Height a row aims for before PolaroidWall stretches it to span the container.
 * Also the fallback height before the wall has been measured.
 */
export const FRAME_HEIGHT = 300;

/** p-2.5 either side of the image. */
export const CARD_PADDING = 20;

interface PolaroidProps {
  photo: PolaroidPhoto;
  /**
   * Image height for this frame, set by the wall's row packing. Every frame in a
   * row shares one, which is what lines their images up top and bottom.
   */
  height?: number;
  /** Image width at that height. Derived from the ratio when not supplied. */
  width?: number;
  /**
   * Skip lazy loading. The wall sets this on the frames that start above the
   * fold, which would otherwise wait for an intersection callback to begin
   * fetching the one image the visitor is already looking at.
   */
  priority?: boolean;
}

export function Polaroid({ photo, height, width, priority = false }: PolaroidProps) {
  const ratio = photo.height > 0 ? photo.width / photo.height : 1;
  const caption = [photo.camera, summarizeSettings(photo.settings)].filter(Boolean).join(' · ');

  // Falls back to the photo's natural size at the target height, which is what
  // server-rendered markup and the first paint use.
  const frameHeight = height ?? FRAME_HEIGHT;
  const frameWidth = width ?? Math.floor(ratio * frameHeight);

  return (
    <article
      // The lift is motion-safe, matching the wall's other movement; the shadow
      // is not, so a reduced-motion visitor still gets the hover feedback.
      className="flex max-w-full flex-col rounded-sm border border-goldline bg-frame p-2.5 pb-3.5 shadow-[0_6px_18px_rgba(0,0,0,0.5)] transition hover:shadow-[0_12px_28px_rgba(0,0,0,0.7)] motion-safe:hover:-translate-y-1"
      // The card is its image plus the frame's own padding. The width comes from
      // the row packing rather than from flex-grow: growing the box without
      // growing the height would distort the frame, and object-cover would crop
      // away whatever the extra width was meant to reveal.
      style={{ width: frameWidth + CARD_PADDING }}
    >
      <div
        className="relative overflow-hidden"
        // The photo's own average colour, not black: a frame that arrives before
        // its image should read as the photo dimmed, not as a hole punched in the
        // card. Costs nothing — the stats are already on the row for the sort.
        style={{ height: frameHeight, backgroundColor: placeholderColor(photo) }}
      >
        <Image
          src={photo.imageUrl}
          alt={photo.location}
          fill
          sizes={`${frameWidth}px`}
          priority={priority}
          className="object-cover"
        />
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-bold tracking-[0.04em] uppercase">{photo.location}</span>
          {photo.takenAt ? (
            <span className="shrink-0 font-mono text-[0.6rem] tracking-[0.05em] text-ash">
              {formatTakenAt(photo.takenAt)}
            </span>
          ) : null}
        </div>
        {caption ? (
          <div className="mt-0.5 truncate font-mono text-[0.65rem] leading-tight tracking-[0.05em] text-gold uppercase">
            {caption}
          </div>
        ) : null}
      </div>
    </article>
  );
}
