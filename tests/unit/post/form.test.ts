import { describe, it, expect } from 'vitest';
import { richTextFromPlain, type PostContent } from '@/lib/post/content';
import { missingForPublish } from '@/lib/post/form';

const body: PostContent = {
  version: 1,
  blocks: [{ id: 'a', type: 'text', body: richTextFromPlain('Landed at six.') }],
};

describe('missingForPublish', () => {
  it('reports nothing for a post with a title and something to read', () => {
    expect(missingForPublish({ title: 'Five days in Seoul', content: body })).toEqual([]);
  });

  it('requires a title and a body', () => {
    expect(missingForPublish({ title: '', content: body })).toEqual(['a title']);
    expect(missingForPublish({ title: 'Seoul', content: { version: 1, blocks: [] } })).toEqual(['something to read']);
  });

  it('treats whitespace and empty blocks as missing', () => {
    const empty: PostContent = {
      version: 1,
      blocks: [
        { id: 'a', type: 'text', body: richTextFromPlain('   ') },
        { id: 'b', type: 'section', numbered: true, label: '', title: ' ', date: '', place: '' },
        { id: 'c', type: 'photos', items: [], layout: 'row', size: 'column', caption: '' },
        { id: 'd', type: 'divider' },
      ],
    };
    expect(missingForPublish({ title: '   ', content: empty })).toEqual(['a title', 'something to read']);
  });

  it('counts a post that is only photos as having a body', () => {
    const photos: PostContent = {
      version: 1,
      blocks: [{ id: 'a', type: 'photos', items: [{ kind: 'journal', id: 'p1' }], layout: 'row', size: 'column', caption: '' }],
    };
    expect(missingForPublish({ title: 'Seoul', content: photos })).toEqual([]);
  });
});
