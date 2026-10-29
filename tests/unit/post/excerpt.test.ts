import { describe, expect, it } from 'vitest';
import { richTextFromPlain, type PostContent } from '@/lib/post/content';
import { contentExcerpt, postExcerpt } from '@/lib/post/excerpt';

describe('contentExcerpt', () => {
  it('reads the prose in order and leaves tips and lists out', () => {
    const content: PostContent = {
      version: 1,
      blocks: [
        { id: 'a', type: 'tip', title: 'Travel hack', body: richTextFromPlain('Buy a T-money card.') },
        { id: 'b', type: 'text', body: richTextFromPlain('Five days in Seoul.') },
        { id: 'c', type: 'list', groups: [{ name: 'Bag', items: [{ name: 'Daypack', note: '' }] }] },
        { id: 'd', type: 'text', body: richTextFromPlain('Mostly on foot.') },
      ],
    };
    expect(contentExcerpt(content)).toBe('Five days in Seoul. Mostly on foot.');
  });

  it('falls back to section titles for a post of only photos', () => {
    const content: PostContent = {
      version: 1,
      blocks: [
        { id: 'a', type: 'section', numbered: true, label: '', title: 'Arrival', date: '', place: '' },
        { id: 'b', type: 'photos', items: [{ kind: 'journal', id: 'p' }], layout: 'row', size: 'column', caption: 'x' },
        { id: 'c', type: 'section', numbered: true, label: '', title: 'Bukchon', date: '', place: '' },
      ],
    };
    expect(contentExcerpt(content)).toBe('Arrival · Bukchon');
  });

  it('cuts to length with an ellipsis, as the Markdown excerpt does', () => {
    const content: PostContent = { version: 1, blocks: [{ id: 'a', type: 'text', body: richTextFromPlain('one two three four') }] };
    expect(contentExcerpt(content, 9)).toBe('one two t…');
  });
});

describe('postExcerpt', () => {
  it('uses the blocks when there are any, the Markdown otherwise', () => {
    const content: PostContent = { version: 1, blocks: [{ id: 'a', type: 'text', body: richTextFromPlain('From blocks.') }] };
    expect(postExcerpt({ content, markdownContent: '# From markdown' })).toBe('From blocks.');
    expect(postExcerpt({ content: null, markdownContent: '# From **markdown**' })).toBe('From markdown');
  });
});
