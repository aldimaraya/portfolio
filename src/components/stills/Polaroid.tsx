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

export function Polaroid({ photo }: { photo: PolaroidPhoto }) {
  // Aspect ratio drives the flex basis, which is what justifies the rows: wide
  // photos claim proportionally more of a row than tall ones.
  const ratio = photo.height > 0 ? photo.width / photo.height : 1;
  const caption = [photo.camera, summarizeSettings(photo.settings)].filter(Boolean).join(' · ');

  return (
    <article
      className="flex h-[380px] flex-col rounded-sm border border-goldline bg-frame p-2.5 pb-3.5 shadow-[0_6px_18px_rgba(0,0,0,0.5)] transition hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.7)]"
      style={{ flexGrow: ratio, flexShrink: 1, flexBasis: `${300 * ratio}px` }}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <Image
          src={photo.imageUrl}
          alt={photo.location}
          fill
          sizes="(max-width: 800px) 100vw, 40vw"
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
