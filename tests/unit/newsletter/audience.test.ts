import { describe, expect, it } from 'vitest';
import { groupLabel, preferenceGroups, reach } from '@/lib/newsletter/audience';
import type { DigestContent } from '@/lib/newsletter/digest';

const all = { journal: true, motion: true, stills: true };
const stillsOnly = { journal: false, motion: false, stills: true };
const motionOnly = { journal: false, motion: true, stills: false };
const stillsJournal = { journal: true, motion: false, stills: true };

describe('groupLabel', () => {
  it('names a choice the way the page reads it', () => {
    expect(groupLabel(all)).toBe('Everything');
    expect(groupLabel(stillsOnly)).toBe('Stills only');
    expect(groupLabel(stillsJournal)).toBe('Stills + Journal');
  });
});

describe('preferenceGroups', () => {
  it('folds subscribers into their distinct choices, Everything first, then the biggest', () => {
    const groups = preferenceGroups([stillsOnly, all, motionOnly, stillsOnly, stillsJournal, stillsOnly]);
    expect(groups.map((group) => [group.label, group.count])).toEqual([
      ['Everything', 1],
      ['Stills only', 3],
      ['Motion only', 1],
      ['Stills + Journal', 1],
    ]);
  });

  it('keeps Everything even when nobody holds it, since it shows every item', () => {
    expect(preferenceGroups([motionOnly]).map((group) => [group.key, group.count])).toEqual([
      ['stills+motion+journal', 0],
      ['motion', 1],
    ]);
  });

  it('ignores a row with nothing ticked', () => {
    expect(preferenceGroups([{ journal: false, motion: false, stills: false }])).toHaveLength(1);
  });
});

describe('reach', () => {
  const content: DigestContent = {
    journal: [],
    motion: [],
    stills: [{ id: 'p', imageUrl: '', width: 1, height: 1, title: '', location: '', takenAt: null }],
  };

  it('counts only the subscribers the batch has something for', () => {
    const groups = preferenceGroups([stillsOnly, all, motionOnly, motionOnly, stillsJournal]);
    expect(reach(content, groups)).toBe(3);
  });
});
