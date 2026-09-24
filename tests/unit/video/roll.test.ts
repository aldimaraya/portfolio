import { describe, expect, it } from 'vitest';
import { frameCode, groupIntoRolls, locateClip, rollLetter } from '@/lib/video/roll';

const roll = (id: string) => ({ id, name: id, description: '' });
const clip = (id: string, rollId: string | null) => ({ id, rollId });

describe('rollLetter', () => {
  it('letters rolls A to Z by position', () => {
    expect(rollLetter(0)).toBe('A');
    expect(rollLetter(1)).toBe('B');
    expect(rollLetter(25)).toBe('Z');
  });

  it('runs on past Z the way a spreadsheet does', () => {
    expect(rollLetter(26)).toBe('AA');
    expect(rollLetter(27)).toBe('AB');
    expect(rollLetter(51)).toBe('AZ');
    expect(rollLetter(52)).toBe('BA');
  });
});

describe('frameCode', () => {
  it('pads the frame number and appends the roll letter', () => {
    expect(frameCode(0)).toBe('01A');
    expect(frameCode(11, 'C')).toBe('12C');
  });
});

describe('groupIntoRolls', () => {
  it('keeps both orders as given', () => {
    const grouped = groupIntoRolls(
      [roll('b'), roll('a')],
      [clip('1', 'a'), clip('2', 'b'), clip('3', 'a')],
    );
    expect(grouped.map((r) => [r.id, r.letter, r.clips.map((c) => c.id)])).toEqual([
      ['b', 'A', ['2']],
      ['a', 'B', ['1', '3']],
    ]);
  });

  // Rows older than rolls: they must not vanish from the page before the
  // backfill has filed them.
  it('files a clip with no roll at the end of the first roll', () => {
    const grouped = groupIntoRolls([roll('a'), roll('b')], [clip('1', null), clip('2', 'a')]);
    expect(grouped[0].clips.map((c) => c.id)).toEqual(['2', '1']);
  });

  it('gives loose clips an unnamed roll when there are no rolls at all', () => {
    const grouped = groupIntoRolls([], [clip('1', null)]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ id: '', name: '', letter: 'A' });
  });

  // A gap from A to C would read as a missing roll.
  it('drops empty rolls and letters around them', () => {
    const grouped = groupIntoRolls(
      [roll('a'), roll('empty'), roll('c')],
      [clip('1', 'a'), clip('2', 'c')],
    );
    expect(grouped.map((r) => `${r.id}:${r.letter}`)).toEqual(['a:A', 'c:B']);
  });

  it('is empty when there is nothing to show', () => {
    expect(groupIntoRolls([roll('a')], [])).toEqual([]);
  });
});

describe('locateClip', () => {
  const rolls = groupIntoRolls(
    [roll('a'), roll('b')],
    [clip('1', 'a'), clip('2', 'a'), clip('3', 'b')],
  );

  it('finds a clip, its place on its roll, and its neighbours', () => {
    const found = locateClip(rolls, '2');
    expect(found?.roll.letter).toBe('A');
    expect(found?.index).toBe(1);
    expect(found?.previous?.id).toBe('1');
    expect(found?.next).toBeNull();
  });

  // Running on into the next roll would splice two sequences together.
  it('stops the pager at the ends of a roll', () => {
    const found = locateClip(rolls, '3');
    expect(found?.index).toBe(0);
    expect(found?.previous).toBeNull();
    expect(found?.next).toBeNull();
  });

  it('returns null for a clip that is not on any roll', () => {
    expect(locateClip(rolls, 'missing')).toBeNull();
  });
});
