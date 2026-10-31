import { describe, expect, it } from 'vitest';
import { emptyRichText, richTextFromPlain, type Block } from '@/lib/post/content';
import { defaultLabel, indexEntries, sectionAnchor, sectionEntries, unwrittenSections } from '@/lib/post/sections';

const day = (id: string, extra: Partial<Extract<Block, { type: 'section' }>> = {}): Block => ({
  id,
  type: 'section',
  numbered: true,
  label: '',
  title: '',
  date: '',
  place: '',
  ...extra,
});
const plain = (id: string, label: string, title = ''): Block => ({ ...day(id), numbered: false, label, title }) as Block;
const divider = (id: string): Block => ({ id, type: 'divider' });

describe('sectionEntries', () => {
  it('numbers days by position and skips plain sections in the count', () => {
    const entries = sectionEntries([plain('a', 'Before you go'), day('b'), divider('x'), day('c'), plain('d', 'Packing')]);
    expect(entries.map((entry) => [entry.label, entry.day])).toEqual([
      ['Before you go', null],
      ['Day 1', 1],
      ['Day 2', 2],
      ['Packing', null],
    ]);
  });

  it('keeps a renamed day in the count, so the days after it keep their numbers', () => {
    const entries = sectionEntries([day('a', { label: 'Arrival' }), day('b')]);
    expect(entries.map((entry) => [entry.label, entry.day])).toEqual([
      ['Arrival', 1],
      ['Day 2', 2],
    ]);
    expect(defaultLabel(entries[0])).toBe('Day 1');
  });

  it('renumbers when a day moves', () => {
    const before = sectionEntries([day('a', { title: 'Seoul' }), day('b', { title: 'Busan' })]);
    const after = sectionEntries([day('b', { title: 'Busan' }), day('a', { title: 'Seoul' })]);
    expect(before.map((entry) => `${entry.label} ${entry.title}`)).toEqual(['Day 1 Seoul', 'Day 2 Busan']);
    expect(after.map((entry) => `${entry.label} ${entry.title}`)).toEqual(['Day 1 Busan', 'Day 2 Seoul']);
  });

  it('gives each section a stable anchor from its id', () => {
    expect(sectionEntries([day('k3j9')])[0].anchor).toBe(sectionAnchor('k3j9'));
  });
});

describe('indexEntries', () => {
  it('leaves out a plain section with neither label nor title', () => {
    expect(indexEntries([plain('a', ''), day('b')]).map((entry) => entry.id)).toEqual(['b']);
  });

  it('falls back to headings in a post with no sections', () => {
    const blocks: Block[] = [
      { id: 'h1', type: 'heading', text: 'The market' },
      { id: 'h2', type: 'heading', text: '  ' },
    ];
    expect(indexEntries(blocks)).toEqual([
      { id: 'h1', anchor: 'section-h1', label: '', day: null, title: 'The market', date: '', place: '' },
    ]);
  });

  it('ignores headings once there are sections', () => {
    const blocks: Block[] = [day('a'), { id: 'h1', type: 'heading', text: 'The market' }];
    expect(indexEntries(blocks).map((entry) => entry.id)).toEqual(['a']);
  });
});

describe('unwrittenSections', () => {
  const text = (id: string, body: string): Block => ({ id, type: 'text', body: body ? richTextFromPlain(body) : emptyRichText() });

  it('names the sections with no words before the next one', () => {
    const blocks = [day('a'), text('t1', 'Arrival'), day('b'), divider('x'), plain('c', 'Last night')];
    expect(unwrittenSections(blocks)).toEqual(['b', 'c']);
  });

  it('does not count an empty text block or the section title as writing', () => {
    expect(unwrittenSections([day('a', { title: 'Haeundae' }), text('t', '')])).toEqual(['a']);
  });

  it('ignores blocks before the first section', () => {
    expect(unwrittenSections([text('intro', ''), day('a'), text('t', 'Words')])).toEqual([]);
  });
});
