import { describe, expect, it } from 'vitest';
import { justifyRows, type JustifyItem } from '@/lib/photo/justify';

const OPTIONS = { targetHeight: 300, gap: 20, padding: 20 };
const WIDTH = 1200;

function items(...ratios: number[]): JustifyItem[] {
  return ratios.map((ratio, index) => ({ id: `p${index}`, ratio }));
}

/** Total width a row occupies on screen, cards plus the gaps between them. */
function rowWidth(row: { width: number }[]): number {
  const cards = row.reduce((sum, item) => sum + item.width + OPTIONS.padding, 0);
  return cards + (row.length - 1) * OPTIONS.gap;
}

describe('justifyRows', () => {
  it('returns nothing for no photos', () => {
    expect(justifyRows([], WIDTH, OPTIONS)).toEqual([]);
  });

  it('gives every frame in a row the same height', () => {
    const rows = justifyRows(items(1.5, 0.66, 1.5, 0.66, 1.5, 1, 1.2), WIDTH, OPTIONS);
    for (const row of rows) {
      const heights = new Set(row.map((item) => item.height));
      expect(heights.size).toBe(1);
    }
  });

  it('fills the container on every row but the last', () => {
    const rows = justifyRows(items(1.5, 0.66, 1.5, 0.66, 1.5, 1, 1.2, 1.5), WIDTH, OPTIONS);
    for (const row of rows.slice(0, -1)) {
      // Never wider than the box — a row that overflows wraps and undoes the
      // packing. Within a few px of it, since each width is floored.
      expect(rowWidth(row)).toBeLessThanOrEqual(WIDTH);
      expect(rowWidth(row)).toBeGreaterThan(WIDTH - 8);
    }
  });

  it('preserves each photo and its order', () => {
    const input = items(1.5, 0.66, 1.5, 0.66, 1.5, 1, 1.2);
    const flat = justifyRows(input, WIDTH, OPTIONS).flat();
    expect(flat.map((item) => item.id)).toEqual(input.map((item) => item.id));
  });

  it('keeps each frame at its own aspect ratio', () => {
    const rows = justifyRows(items(1.5, 0.66, 1.5, 0.66, 1.5), WIDTH, OPTIONS);
    for (const item of rows.flat()) {
      expect(item.width / item.height).toBeCloseTo(item.ratio, 1);
    }
  });

  it('does not stretch a lone photo on the last row', () => {
    const rows = justifyRows(items(1.5), WIDTH, OPTIONS);
    expect(rows).toHaveLength(1);
    expect(rows[0][0].height).toBe(OPTIONS.targetHeight);
  });

  it('does not stretch an under-full last row past the target', () => {
    const rows = justifyRows(items(1.5, 0.66, 1.5, 0.66, 1.5, 1.5), WIDTH, OPTIONS);
    for (const item of rows[rows.length - 1]) {
      expect(item.height).toBeLessThanOrEqual(OPTIONS.targetHeight);
    }
  });

  it('falls back to one target-height row before the container is measured', () => {
    const rows = justifyRows(items(1.5, 0.66, 1.5), 0, OPTIONS);
    expect(rows).toHaveLength(1);
    expect(rows[0].every((item) => item.height === OPTIONS.targetHeight)).toBe(true);
  });

  it('treats a photo with missing dimensions as square rather than dividing by zero', () => {
    const rows = justifyRows(items(0, 1.5, 1.5, 1.5, 1.5), WIDTH, OPTIONS);
    const first = rows.flat().find((item) => item.id === 'p0');
    expect(first?.width).toBeGreaterThan(0);
    expect(Number.isFinite(first?.height)).toBe(true);
  });

  it('handles a container narrower than a single frame', () => {
    const rows = justifyRows(items(1.5, 1.5), 60, OPTIONS);
    for (const item of rows.flat()) {
      expect(item.width).toBeGreaterThanOrEqual(1);
      expect(item.height).toBeGreaterThanOrEqual(1);
    }
  });

  it('fits more narrow portraits per row than wide landscapes', () => {
    const portraits = justifyRows(items(...Array(12).fill(0.66)), WIDTH, OPTIONS);
    const landscapes = justifyRows(items(...Array(12).fill(1.8)), WIDTH, OPTIONS);
    expect(portraits.length).toBeLessThan(landscapes.length);
  });

  it('packs more photos per row as the container widens', () => {
    const ratios = Array(20).fill(1.5);
    const narrow = justifyRows(items(...ratios), 800, OPTIONS);
    const wide = justifyRows(items(...ratios), 2000, OPTIONS);
    expect(wide[0].length).toBeGreaterThan(narrow[0].length);
  });
});
