import { describe, expect, it } from 'vitest';
import { emptyRichText, richTextFromPlain, type Block } from '@/lib/post/content';
import {
  defaultLabel,
  enclosingSubsection,
  indexEntries,
  sectionAnchor,
  sectionEntries,
  subsectionsBySection,
  unwrittenSections,
} from '@/lib/post/sections';

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
const heading = (id: string, text: string): Block => ({ id, type: 'heading', text });

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
      { id: 'h1', anchor: 'section-h1', label: '', day: null, title: 'The market', date: '', place: '', subsections: [] },
    ]);
  });

  it('lists headings under their section once there are sections, not as rows of their own', () => {
    const blocks: Block[] = [
      day('a', { title: 'Cuisine' }),
      heading('h1', 'Dim sum'),
      divider('x'),
      heading('h2', 'Roast goose'),
      plain('b', 'Sights'),
      heading('h3', 'The Peak'),
    ];
    expect(indexEntries(blocks).map((entry) => [entry.id, entry.subsections.map((sub) => sub.title)])).toEqual([
      ['a', ['Dim sum', 'Roast goose']],
      ['b', ['The Peak']],
    ]);
  });

  it('drops the subsections of a section it leaves out, rather than hanging them on the one above', () => {
    const blocks: Block[] = [day('a', { title: 'Cuisine' }), plain('b', ''), heading('h1', 'Orphaned')];
    expect(indexEntries(blocks).map((entry) => [entry.id, entry.subsections.length])).toEqual([['a', 0]]);
  });
});

describe('subsectionsBySection', () => {
  it('leaves out headings before the first section, and empty ones', () => {
    const map = subsectionsBySection([heading('h0', 'Intro'), day('a'), heading('h1', '  '), heading('h2', ' Dim sum ')]);
    expect([...map.keys()]).toEqual(['a']);
    expect(map.get('a')).toEqual([{ id: 'h2', anchor: 'section-h2', title: 'Dim sum' }]);
  });

  it('gives a section with no headings an empty list', () => {
    expect(subsectionsBySection([day('a'), day('b'), heading('h1', 'x')]).get('a')).toEqual([]);
  });
});

describe('enclosingSubsection', () => {
  const blocks: Block[] = [day('a'), divider('lead'), heading('h1', 'Dim sum'), divider('x'), day('b'), divider('y')];

  it('finds the heading over the selection within its section', () => {
    expect(enclosingSubsection(blocks, 'x')).toBe('h1');
    expect(enclosingSubsection(blocks, 'h1')).toBe('h1');
  });

  it('stops at the section, so a lead-in or the next section has none', () => {
    expect(enclosingSubsection(blocks, 'lead')).toBeNull();
    expect(enclosingSubsection(blocks, 'y')).toBeNull();
    expect(enclosingSubsection(blocks, 'b')).toBeNull();
    expect(enclosingSubsection(blocks, null)).toBeNull();
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
