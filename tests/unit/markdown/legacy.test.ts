import { describe, expect, it } from 'vitest';
import { legacyMediaUrls, markdownToContent, resolveLegacyMedia } from '@/lib/markdown/legacy';
import { postContentSchema, type Block } from '@/lib/post/content';

const types = (blocks: Block[]) => blocks.map((block) => block.type);

describe('markdownToContent', () => {
  it('always produces valid content', () => {
    const content = markdownToContent(
      '# Title\n\nSome **bold** and *italic* with a [link](https://x.test).\n\n- one\n- two\n\n> quoted\n\n---\n\n```\ncode\n```\n\n<div>html</div>\n\n| a | b |\n|---|---|\n| 1 | 2 |',
    );
    expect(postContentSchema.safeParse(content).success).toBe(true);
  });

  it('keeps consecutive prose and lists together in one text block', () => {
    const { blocks } = markdownToContent('First.\n\nSecond.\n\n- a\n- b\n\nThird.');
    expect(types(blocks)).toEqual(['text']);
    expect(blocks[0].type === 'text' && blocks[0].body.content.map((node) => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'bulletList',
      'paragraph',
    ]);
  });

  it('turns marks into marks, nested', () => {
    const { blocks } = markdownToContent('A ***both*** [**bold link**](https://x.test)');
    const paragraph = blocks[0].type === 'text' ? blocks[0].body.content[0] : null;
    expect(paragraph).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'A ' },
        { type: 'text', text: 'both', marks: [{ type: 'italic' }, { type: 'bold' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'bold link', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }, { type: 'bold' }] },
      ],
    });
  });

  it('drops an unsafe link to its text', () => {
    const { blocks } = markdownToContent('[click](javascript:alert(1))');
    expect(blocks[0].type === 'text' && blocks[0].body.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'click' }] });
  });

  it('makes a lone image a captioned photo block', () => {
    const { blocks } = markdownToContent('Before.\n\n![Oslo harbour](https://cdn.test/journal/a.webp)\n\nAfter.');
    expect(types(blocks)).toEqual(['text', 'photos', 'text']);
    expect(blocks[1]).toMatchObject({
      type: 'photos',
      layout: 'stacked',
      caption: 'Oslo harbour',
      items: [{ kind: 'external', url: 'https://cdn.test/journal/a.webp', alt: 'Oslo harbour' }],
    });
  });

  it('makes a video image an embed with its poster', () => {
    const { blocks } = markdownToContent('![Roof](https://cdn.test/v/a.mp4 "poster:https://cdn.test/p/a.webp")');
    expect(blocks[0]).toMatchObject({ type: 'embed', url: 'https://cdn.test/v/a.mp4', poster: 'https://cdn.test/p/a.webp', caption: 'Roof' });
  });

  it('embeds a lone YouTube link but leaves one in a sentence as a link', () => {
    expect(markdownToContent('https://youtu.be/dQw4w9WgXcQ').blocks[0]).toMatchObject({ type: 'embed', url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(types(markdownToContent('Watch https://youtu.be/dQw4w9WgXcQ today.').blocks)).toEqual(['text']);
  });

  it('maps headings, quotes and rules to their own blocks', () => {
    const { blocks } = markdownToContent('## The market\n\n> Go early.\n\n***');
    expect(blocks).toMatchObject([
      { type: 'heading', text: 'The market' },
      { type: 'quote', text: 'Go early.' },
      { type: 'divider' },
    ]);
  });

  it('moves an image out of the middle of a sentence to follow it', () => {
    const { blocks } = markdownToContent('Look ![x](https://cdn.test/a.webp) here.');
    expect(types(blocks)).toEqual(['text', 'photos']);
  });

  it('converts an empty post to no blocks', () => {
    expect(markdownToContent('').blocks).toEqual([]);
  });
});

describe('resolving against the library', () => {
  it('swaps library URLs for references and leaves the rest', () => {
    const content = markdownToContent(
      '![a](https://cdn.test/photos/a.webp)\n\n![b](https://elsewhere.test/b.jpg)\n\n![c](https://cdn.test/videos/c.mp4)\n\n![d](https://cdn.test/journal/d.mp4)',
    );
    expect(legacyMediaUrls(content)).toEqual({
      images: ['https://cdn.test/photos/a.webp', 'https://elsewhere.test/b.jpg'],
      videos: ['https://cdn.test/videos/c.mp4', 'https://cdn.test/journal/d.mp4'],
    });

    const resolved = resolveLegacyMedia(
      content,
      new Map([['https://cdn.test/photos/a.webp', 'photo1']]),
      new Map([['https://cdn.test/videos/c.mp4', 'clip1']]),
    );
    expect(resolved.blocks).toMatchObject([
      { type: 'photos', items: [{ kind: 'still', id: 'photo1' }] },
      { type: 'photos', items: [{ kind: 'external', url: 'https://elsewhere.test/b.jpg' }] },
      { type: 'clip', videoId: 'clip1', caption: 'c' },
      { type: 'embed', url: 'https://cdn.test/journal/d.mp4' },
    ]);
  });
});
