import { describe, expect, it } from 'vitest';
import { MAX_PLACE_LENGTH, normalizePlace, placeFromAddress, roundCoordinates } from '@/lib/geo/place';

describe('roundCoordinates', () => {
  it('rounds to three decimals, about 110 m', () => {
    expect(roundCoordinates(35.011634, 135.768029)).toEqual({ latitude: 35.012, longitude: 135.768 });
  });

  it('keeps the sign in the southern and western hemispheres', () => {
    expect(roundCoordinates(-33.85678, -151.21529)).toEqual({ latitude: -33.857, longitude: -151.215 });
  });

  it('refuses Null Island, which is a camera with no fix', () => {
    expect(roundCoordinates(0, 0)).toBeNull();
  });

  it('refuses anything off the globe or not a number', () => {
    expect(roundCoordinates(91, 0)).toBeNull();
    expect(roundCoordinates(0, 181)).toBeNull();
    expect(roundCoordinates(Number.NaN, 10)).toBeNull();
    expect(roundCoordinates(null, 10)).toBeNull();
    expect(roundCoordinates('35', '135')).toBeNull();
  });
});

describe('placeFromAddress', () => {
  it('takes the city', () => {
    expect(
      placeFromAddress({ city: 'Kyoto', province: 'Kyoto Prefecture', country: 'Japan', country_code: 'jp' }),
    ).toBe('Kyoto');
  });

  it('takes a town or village where there is no city', () => {
    expect(placeFromAddress({ town: 'Hakone', state: 'Kanagawa Prefecture', country: 'Japan' })).toBe('Hakone');
    expect(placeFromAddress({ village: 'Shirakawa', country: 'Japan' })).toBe('Shirakawa');
  });

  it('falls back to the wider area out in the country', () => {
    expect(placeFromAddress({ county: 'Mariposa County', state: 'California', country: 'United States' })).toBe(
      'Mariposa County',
    );
    expect(placeFromAddress({ country: 'Iceland' })).toBe('Iceland');
  });

  it('skips a blank field rather than naming a place ""', () => {
    expect(placeFromAddress({ city: '  ', town: 'Nara' })).toBe('Nara');
  });

  it('names nothing when there is no address', () => {
    expect(placeFromAddress(undefined)).toBeNull();
    expect(placeFromAddress({})).toBeNull();
    expect(placeFromAddress('Kyoto')).toBeNull();
  });
});

describe('normalizePlace', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePlace('  Arashiyama,\n  Kyoto ')).toBe('Arashiyama, Kyoto');
  });

  it('turns an empty name into no place', () => {
    expect(normalizePlace('   ')).toBeNull();
    expect(normalizePlace(null)).toBeNull();
  });

  it('caps the length', () => {
    expect(normalizePlace('x'.repeat(200))).toHaveLength(MAX_PLACE_LENGTH);
  });
});
