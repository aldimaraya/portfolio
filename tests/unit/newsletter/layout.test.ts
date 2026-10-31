import { describe, expect, it } from 'vitest';
import { byPosition, messageParagraphs, sectionOrder, swapSections } from '@/lib/newsletter/layout';

describe('sectionOrder', () => {
  it('defaults to journal, motion, stills', () => {
    expect(sectionOrder([])).toEqual(['journal', 'motion', 'stills']);
    expect(sectionOrder(null)).toEqual(['journal', 'motion', 'stills']);
  });

  it('keeps a stored order and fills in whatever it is missing', () => {
    expect(sectionOrder(['stills', 'journal'])).toEqual(['stills', 'journal', 'motion']);
  });

  it('drops unknown and repeated kinds', () => {
    expect(sectionOrder(['motion', 'audio', 'motion', 'stills'])).toEqual(['motion', 'stills', 'journal']);
  });
});

describe('swapSections', () => {
  it('swaps two sections, wherever they are', () => {
    expect(swapSections(['journal', 'motion', 'stills'], 'stills', 'journal')).toEqual(['stills', 'motion', 'journal']);
  });

  it('leaves the order alone for an unknown section', () => {
    expect(swapSections(['journal', 'motion'], 'journal', 'stills')).toEqual(['journal', 'motion']);
  });
});

describe('byPosition', () => {
  it('puts placed items first and keeps queue order among the rest', () => {
    const rows = [
      { id: 'a', position: null },
      { id: 'b', position: 1 },
      { id: 'c', position: null },
      { id: 'd', position: 0 },
    ];
    expect(byPosition(rows).map((row) => row.id)).toEqual(['d', 'b', 'a', 'c']);
  });
});

describe('messageParagraphs', () => {
  it('splits on blank lines and trims', () => {
    expect(messageParagraphs('  Hello there.\r\n\r\n  Back from Busan,\nmore soon. \n\n\n')).toEqual([
      'Hello there.',
      'Back from Busan,\nmore soon.',
    ]);
  });

  it('is empty for whitespace', () => {
    expect(messageParagraphs(' \n \n')).toEqual([]);
  });
});
