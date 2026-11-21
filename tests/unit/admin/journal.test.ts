import { describe, expect, it } from 'vitest';
import { parsePostFilter, summarizeDraft } from '@/lib/admin/journal';
import { richTextFromPlain, emptyRichText, type Block } from '@/lib/post/content';

const section = (id: string, extra: Partial<Block & { type: 'section' }> = {}): Block => ({
  id,
  type: 'section',
  numbered: false,
  label: '',
  title: '',
  ...extra,
});
const text = (id: string, body: string): Block => ({
  id,
  type: 'text',
  body: body ? richTextFromPlain(body) : emptyRichText(),
});
const photos = (id: string, ids: string[]): Block => ({
  id,
  type: 'photos',
  items: ids.map((photo) => ({ kind: 'journal' as const, id: photo })),
  layout: 'row',
  size: 'column',
  caption: '',
});
const post = (blocks: Block[], title = 'Three days in Busan') => ({ title, content: { version: 1 as const, blocks } });

describe('parsePostFilter', () => {
  it('reads the known filters and falls back to all', () => {
    expect(parsePostFilter('drafts')).toBe('drafts');
    expect(parsePostFilter('published')).toBe('published');
    expect(parsePostFilter('nonsense')).toBe('all');
    expect(parsePostFilter(undefined)).toBe('all');
  });
});

describe('summarizeDraft', () => {
  it('counts sections and placed trip photos', () => {
    const blocks = [
      section('a', { label: 'Food' }),
      text('t', 'Arrival'),
      photos('p', ['1', '2']),
      section('b', { label: 'Sights' }),
      text('t2', 'More'),
      section('s', { label: 'Packing' }),
      text('t3', 'Bags'),
    ];
    const summary = summarizeDraft(post(blocks), ['1', '2', '3']);
    expect(summary.meta).toBe('3 sections · 3 trip photos, 2 placed');
    expect(summary.warnings).toEqual(['1 photo unplaced']);
  });

  it('calls an empty post empty and asks only for what publishing needs', () => {
    expect(summarizeDraft(post([], ''), [])).toEqual({
      meta: 'Empty',
      warnings: ['Needs a title', 'Needs something to read'],
    });
  });

  it('puts publish blockers before the soft warnings', () => {
    const summary = summarizeDraft(post([section('a', { label: 'Food' })], ''), ['1', '2']);
    expect(summary.warnings).toEqual(['Needs a title', 'Needs something to read', 'Food has no text yet', '2 photos unplaced']);
  });

  it('flags a headed section with no short name, since the index lists it by that', () => {
    const blocks = [section('a', { title: 'The climate here sucks.' }), text('t', 'Hot'), section('b'), text('t2', 'Still being written')];
    expect(summarizeDraft(post(blocks), []).warnings).toEqual(['“The climate here sucks.” has no short name']);
  });
});
