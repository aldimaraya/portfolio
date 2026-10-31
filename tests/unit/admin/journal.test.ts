import { describe, expect, it } from 'vitest';
import { parsePostFilter, summarizeDraft } from '@/lib/admin/journal';
import { richTextFromPlain, emptyRichText, type Block } from '@/lib/post/content';

const day = (id: string, extra: Partial<Block & { type: 'section' }> = {}): Block => ({
  id,
  type: 'section',
  numbered: true,
  label: '',
  title: '',
  date: '',
  place: '',
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
  it('counts days, sections and placed trip photos', () => {
    const blocks = [
      day('a'),
      text('t', 'Arrival'),
      photos('p', ['1', '2']),
      day('b'),
      text('t2', 'More'),
      { ...day('s'), numbered: false, label: 'Packing' } as Block,
      text('t3', 'Bags'),
    ];
    const summary = summarizeDraft(post(blocks), ['1', '2', '3']);
    expect(summary.meta).toBe('2 days · 1 section · 3 trip photos, 2 placed');
    expect(summary.warnings).toEqual(['1 photo unplaced']);
  });

  it('calls an empty post empty and asks only for what publishing needs', () => {
    expect(summarizeDraft(post([], ''), [])).toEqual({
      meta: 'Empty',
      warnings: ['Needs a title', 'Needs something to read'],
    });
  });

  it('puts publish blockers before the soft warnings', () => {
    const summary = summarizeDraft(post([day('a')], ''), ['1', '2']);
    expect(summary.warnings).toEqual(['Needs a title', 'Needs something to read', 'Day 1 has no text yet', '2 photos unplaced']);
  });
});
