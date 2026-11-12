import { describe, expect, it } from 'vitest';
import type { Block } from '@/lib/post/content';
import { coverImage, emptyMedia, firstImage, referencedMedia, type PostMedia } from '@/lib/post/media';

const photos = (id: string, items: Extract<Block, { type: 'photos' }>['items']): Block => ({
  id,
  type: 'photos',
  items,
  layout: 'stacked',
  size: 'column',
  caption: '',
});

const image = (url: string) => ({ url, width: 1500, height: 1000, alt: '' });

const media: PostMedia = {
  ...emptyMedia(),
  journal: { j1: image('https://cdn.test/journal/j1.webp'), j2: image('https://cdn.test/journal/j2.webp') },
  stills: { s1: image('https://cdn.test/photos/s1.webp') },
};

const blocks = [photos('a', [{ kind: 'journal', id: 'j1' }]), photos('b', [{ kind: 'journal', id: 'j2' }])];

describe('referencedMedia', () => {
  it('includes the picked cover, so it is loaded even when no block uses it', () => {
    expect(referencedMedia(blocks, { kind: 'still', id: 's9' })).toEqual({ journal: ['j1', 'j2'], stills: ['s9'], clips: [] });
    expect(referencedMedia(blocks, { kind: 'journal', id: 'j1' }).journal).toEqual(['j1', 'j2']);
    expect(referencedMedia(blocks).stills).toEqual([]);
  });
});

describe('coverImage', () => {
  it('is the first photo when none was picked', () => {
    expect(coverImage({ blocks }, media)).toEqual(firstImage(blocks, media));
    expect(coverImage({ blocks }, media)?.url).toContain('j1');
  });

  it('is the picked photo, from the tray or the wall, wherever it sits or whether it is used at all', () => {
    expect(coverImage({ blocks, cover: { kind: 'journal', id: 'j2' } }, media)?.url).toContain('j2');
    expect(coverImage({ blocks, cover: { kind: 'still', id: 's1' } }, media)?.url).toContain('s1');
  });

  it('falls back to the first photo when the picked one is gone', () => {
    expect(coverImage({ blocks, cover: { kind: 'journal', id: 'deleted' } }, media)?.url).toContain('j1');
    expect(coverImage({ blocks: [], cover: { kind: 'still', id: 'gone' } }, media)).toBeNull();
  });
});
