import { describe, expect, it } from 'vitest';
import { aspect, clampScale, figureWidth, photoWidth } from '@/lib/post/fit';

describe('aspect', () => {
  it('is width over height, and 3:2 when the size is unknown', () => {
    expect(aspect({ width: 1000, height: 1500 })).toBeCloseTo(2 / 3);
    expect(aspect({ width: 0, height: 0 })).toBe(1.5);
  });
});

describe('clampScale', () => {
  it('snaps to the step and holds the range', () => {
    expect(clampScale(43.7)).toBe(45);
    expect(clampScale(5)).toBe(20);
    expect(clampScale(130)).toBe(100);
  });
});

describe('figureWidth', () => {
  it('caps a portrait at the height of the screen', () => {
    expect(figureWidth('stacked', [2 / 3])).toBe('min(100%, calc(80svh * 0.6667))');
  });

  it('caps stacked photos by the widest of them', () => {
    expect(figureWidth('stacked', [2 / 3, 1.5], 50)).toBe('min(50%, calc(80svh * 1.5))');
  });

  it('caps a row by the sum of its ratios, with the gaps added back', () => {
    expect(figureWidth('row', [2 / 3, 2 / 3])).toBe('min(100%, calc(80svh * 1.3333 + 0.5rem))');
    expect(figureWidth('row', [1.5])).toBe('min(100%, calc(80svh * 1.5))');
  });

  it('leaves a grid or carousel at full width unless it is scaled', () => {
    expect(figureWidth('grid', [2 / 3, 2 / 3])).toBeUndefined();
    expect(figureWidth('carousel', [2 / 3], 60)).toBe('60%');
  });
});

describe('photoWidth', () => {
  it('holds one stacked photo to the cap', () => {
    expect(photoWidth(0.75)).toBe('min(100%, calc(80svh * 0.75))');
  });
});
