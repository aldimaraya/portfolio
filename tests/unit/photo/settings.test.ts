import { describe, it, expect } from 'vitest';
import {
  EMPTY_SETTINGS,
  settingsFromExif,
  summarizeSettings,
  toSettings,
} from '@/lib/photo/settings';

describe('settingsFromExif', () => {
  it('formats a full EXIF block the way a photographer writes it', () => {
    expect(
      settingsFromExif({
        lens: 'Sigma 35mm F1.4 DG HSM',
        focalLength: 35,
        aperture: 1.4,
        shutter: '1/250',
        iso: 400,
      }),
    ).toEqual({
      lens: 'Sigma 35mm F1.4 DG HSM',
      focalLength: '35mm',
      aperture: 'f/1.4',
      shutter: '1/250',
      iso: '400',
    });
  });

  it('rounds focal length to a whole millimetre', () => {
    expect(settingsFromExif({ focalLength: 34.7 }).focalLength).toBe('35mm');
  });

  it('leaves unrecorded values blank rather than inventing them', () => {
    expect(settingsFromExif({ iso: 100 })).toEqual({
      ...EMPTY_SETTINGS,
      iso: '100',
    });
  });

  it('returns all blanks for a file with no EXIF', () => {
    expect(settingsFromExif({})).toEqual(EMPTY_SETTINGS);
  });
});

describe('summarizeSettings', () => {
  it('joins the populated fields into one line', () => {
    expect(
      summarizeSettings({
        lens: 'Summilux',
        focalLength: '35mm',
        aperture: 'f/1.4',
        shutter: '1/250',
        iso: '400',
      }),
    ).toBe('Summilux · 35mm · f/1.4 · 1/250 · ISO 400');
  });

  it('omits a focal length the lens name already states', () => {
    expect(
      summarizeSettings({ ...EMPTY_SETTINGS, lens: 'Summilux 35mm', focalLength: '35mm' }),
    ).toBe('Summilux 35mm');
  });

  it('drops blank fields instead of leaving empty separators', () => {
    expect(summarizeSettings({ ...EMPTY_SETTINGS, aperture: 'f/8', iso: '100' })).toBe(
      'f/8 · ISO 100',
    );
  });

  it('returns an empty string when nothing is filled in', () => {
    expect(summarizeSettings(EMPTY_SETTINGS)).toBe('');
  });
});

describe('toSettings', () => {
  it('passes a well-formed object through', () => {
    const settings = { ...EMPTY_SETTINGS, iso: '400' };
    expect(toSettings(settings)).toEqual(settings);
  });

  it('fills in keys missing from an older row', () => {
    expect(toSettings({ iso: '400' })).toEqual({ ...EMPTY_SETTINGS, iso: '400' });
  });

  it('falls back to blanks for malformed or absent JSON', () => {
    expect(toSettings(null)).toEqual(EMPTY_SETTINGS);
    expect(toSettings('nonsense')).toEqual(EMPTY_SETTINGS);
    expect(toSettings({ iso: 400 })).toEqual(EMPTY_SETTINGS);
  });
});
