import { describe, it, expect } from 'vitest';
import {
  exifCapturedAtToInputValue,
  formatTakenAt,
  inputValueToTakenAt,
  takenAtToInputValue,
} from '@/lib/photo/date';

describe('inputValueToTakenAt', () => {
  it('parses a date input value as UTC midnight', () => {
    const date = inputValueToTakenAt('2024-03-15');
    expect(date?.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('reports an empty value as unknown rather than a date', () => {
    expect(inputValueToTakenAt('')).toBeNull();
  });
});

describe('takenAtToInputValue', () => {
  it('reads the stored UTC midnight back out as the same calendar day', () => {
    expect(takenAtToInputValue(new Date('2024-03-15T00:00:00.000Z'))).toBe('2024-03-15');
  });

  it('pads single-digit months and days', () => {
    expect(takenAtToInputValue(new Date('2024-01-05T00:00:00.000Z'))).toBe('2024-01-05');
  });

  it('round-trips through inputValueToTakenAt', () => {
    const value = '2024-12-31';
    expect(takenAtToInputValue(inputValueToTakenAt(value)!)).toBe(value);
  });
});

describe('exifCapturedAtToInputValue', () => {
  it('reads the calendar day off the Date components exifr parsed', () => {
    // Constructed from local components, the way exifr builds DateTimeOriginal —
    // no timezone conversion should occur in translating this to an input value.
    expect(exifCapturedAtToInputValue(new Date(2024, 2, 15, 13, 26, 53))).toBe('2024-03-15');
  });
});

describe('formatTakenAt', () => {
  it('formats month and year only, uppercased', () => {
    expect(formatTakenAt(new Date('2024-03-15T00:00:00.000Z'))).toBe('MAR 2024');
  });

  it('does not drift a day near a month boundary', () => {
    expect(formatTakenAt(new Date('2024-01-01T00:00:00.000Z'))).toBe('JAN 2024');
  });
});
