import type { Block, PhotoRef } from './content';

/**
 * What a post's blocks point at, resolved. Blocks store ids, not URLs, so a
 * renderer is handed this alongside them: the server builds it with one query
 * per table (lib/post/load.ts), the editor keeps its own copy as photos are
 * uploaded and picked. A reference with no entry here is skipped at render — a
 * photo deleted from the wall drops out of a post rather than breaking it.
 */

export interface ResolvedImage {
  url: string;
  width: number;
  height: number;
  /** Alt text the image carries on its own; the block caption is used when blank. */
  alt: string;
}

export interface ResolvedClip {
  videoUrl: string;
  posterImageUrl: string;
  width: number;
  height: number;
  title: string;
}

export interface PostMedia {
  journal: Record<string, ResolvedImage>;
  stills: Record<string, ResolvedImage>;
  clips: Record<string, ResolvedClip>;
}

export function emptyMedia(): PostMedia {
  return { journal: {}, stills: {}, clips: {} };
}

export interface MediaIds {
  journal: string[];
  stills: string[];
  clips: string[];
}

/** Every id the blocks reference, by table, deduplicated. */
export function referencedMedia(blocks: Block[]): MediaIds {
  const journal = new Set<string>();
  const stills = new Set<string>();
  const clips = new Set<string>();

  for (const block of blocks) {
    if (block.type === 'photos') {
      for (const ref of block.items) {
        if (ref.kind === 'journal') journal.add(ref.id);
        else if (ref.kind === 'still') stills.add(ref.id);
      }
    } else if (block.type === 'clip' && block.videoId) {
      clips.add(block.videoId);
    }
  }

  return { journal: [...journal], stills: [...stills], clips: [...clips] };
}

/** One photo reference resolved, or null when its row is gone. */
export function resolvePhoto(ref: PhotoRef, media: PostMedia): ResolvedImage | null {
  if (ref.kind === 'external') {
    // No dimensions are known for an image that was never ours; the renderer
    // lays it out at its natural size rather than inventing a ratio.
    return { url: ref.url, width: 0, height: 0, alt: ref.alt };
  }
  return (ref.kind === 'journal' ? media.journal : media.stills)[ref.id] ?? null;
}

/** The first picture in a post, for its link preview. */
export function firstImage(blocks: Block[], media: PostMedia): ResolvedImage | null {
  for (const block of blocks) {
    if (block.type !== 'photos') continue;
    for (const ref of block.items) {
      const image = resolvePhoto(ref, media);
      if (image && image.width > 0) return image;
    }
  }
  return null;
}
