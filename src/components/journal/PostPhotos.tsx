import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import type { BlockOf, PhotoSize } from '@/lib/post/content';
import { isOptimisableUrl } from '@/lib/markdown/media';
import { aspect, figureWidth, MAX_SCALE, photoWidth } from '@/lib/post/fit';
import { resolvePhoto, type PostMedia, type ResolvedImage } from '@/lib/post/media';
import { PhotoCarousel } from './PhotoCarousel';

/** Set from next.config's `env`, which derives it from R2_PUBLIC_BASE_URL. */
const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_HOST ?? '';

/**
 * The widths each size is laid out at on a full-width page, in CSS px — the
 * text column, the column plus the margin, and the whole 1300px container.
 * Only feed next/image's `sizes`, so they need to be close, not exact.
 */
const SIZE_WIDTH: Record<PhotoSize, number> = { column: 672, wide: 832, full: 1252 };

/** Below the sheet's single-column width every size is the width of the screen. */
const PHONE = '(max-width: 48rem)';

export interface ShownImage extends ResolvedImage {
  key: string;
}

/** The images a block can show, in order, with references to deleted rows dropped. */
export function shownImages(block: BlockOf<'photos'>, media: PostMedia): ShownImage[] {
  return block.items.flatMap((ref, index) => {
    const image = resolvePhoto(ref, media);
    return image ? [{ ...image, key: `${index}-${image.url}` }] : [];
  });
}

/**
 * A photos block: its pictures laid out as the block says, at the width
 * figureWidth settles on. Returns nothing when every photo it named has since
 * been deleted, rather than an empty figure. `handles` is the editor's resize
 * grips, drawn inside the figure so they sit on its edges.
 */
export function PostPhotos({ block, media, handles }: { block: BlockOf<'photos'>; media: PostMedia; handles?: ReactNode }) {
  const images = shownImages(block, media);
  if (!images.length) return null;

  const scale = block.scale ?? MAX_SCALE;
  // What `sizes` asks next/image for: the scaled width. The height cap can make
  // it narrower still, which only means a slightly sharper photo than needed.
  const width = Math.round((SIZE_WIDTH[block.size] * scale) / MAX_SCALE);
  const caption = block.caption.trim();
  const style = { width: figureWidth(block.layout, images.map(aspect), scale) };

  return (
    <figure className="post-figure" style={style}>
      {block.layout === 'carousel' ? (
        <PhotoCarousel
          slides={images.map((image) => (
            <Picture
              key={image.key}
              image={image}
              alt={image.alt || caption}
              sizes={`${PHONE} 100vw, ${width}px`}
              fill
            />
          ))}
          label={caption || 'Photos'}
        />
      ) : block.layout === 'row' ? (
        <Row images={images} caption={caption} width={width} />
      ) : block.layout === 'grid' ? (
        <div className="post-photo-grid" data-columns={images.length === 2 || images.length === 4 ? 2 : 3}>
          {images.map((image) => (
            <div key={image.key} className="post-photo-cell">
              <Picture
                image={image}
                alt={image.alt || caption}
                sizes={`${PHONE} 50vw, ${Math.round(width / 3)}px`}
                fill
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="post-photo-stack">
          {images.map((image) => (
            <Picture
              key={image.key}
              image={image}
              alt={image.alt || caption}
              sizes={`${PHONE} 100vw, ${width}px`}
              style={{ width: photoWidth(aspect(image)) }}
            />
          ))}
        </div>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
      {handles}
    </figure>
  );
}

/**
 * A justified row: each picture's share of the width is its aspect ratio's share
 * of the total, which is what gives them all the same height.
 */
function Row({ images, caption, width }: { images: ShownImage[]; caption: string; width: number }) {
  const ratios = images.map(aspect);
  const total = ratios.reduce((sum, ratio) => sum + ratio, 0);

  return (
    <div className="post-photo-row">
      {images.map((image, index) => {
        const share = ratios[index] / total;
        return (
          <div key={image.key} className="post-photo-cell" style={{ flexGrow: ratios[index], aspectRatio: ratios[index] }}>
            <Picture
              image={image}
              alt={image.alt || caption}
              sizes={`${PHONE} ${Math.round(share * 100)}vw, ${Math.round(share * width)}px`}
              fill
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * One picture. Through next/image when it is ours and its size is known; as a
 * plain <img> otherwise — next/image throws on a host outside remotePatterns,
 * and a throw during render takes the whole post down (see isOptimisableUrl).
 */
function Picture({
  image,
  alt,
  sizes,
  fill = false,
  style,
}: {
  image: ResolvedImage;
  alt: string;
  sizes: string;
  fill?: boolean;
  style?: CSSProperties;
}) {
  const known = image.width > 0 && image.height > 0;

  if (!known || !isOptimisableUrl(image.url, MEDIA_HOST)) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={image.url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={fill ? 'post-photo-fill' : 'post-photo'}
        style={style}
      />
    );
  }

  return fill ? (
    <Image src={image.url} alt={alt} fill sizes={sizes} className="post-photo-fill" />
  ) : (
    <Image src={image.url} alt={alt} width={image.width} height={image.height} sizes={sizes} className="post-photo" style={style} />
  );
}
