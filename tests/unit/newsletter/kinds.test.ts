import { describe, it, expect } from 'vitest';
import { chosenKinds, preferencesSchema } from '@/lib/newsletter/kinds';
import { subscriberEmailSchema } from '@/lib/newsletter/email';

describe('preferencesSchema', () => {
  it('accepts any mix with at least one chosen', () => {
    expect(preferencesSchema.safeParse({ journal: false, motion: true, stills: false }).success).toBe(true);
  });

  it('refuses choosing nothing', () => {
    expect(preferencesSchema.safeParse({ journal: false, motion: false, stills: false }).success).toBe(false);
  });
});

describe('chosenKinds', () => {
  it('keeps the canonical order', () => {
    expect(chosenKinds({ stills: true, journal: true, motion: false })).toEqual(['journal', 'stills']);
  });
});

describe('subscriberEmailSchema', () => {
  it('trims and lowercases, so one inbox is one row', () => {
    expect(subscriberEmailSchema.parse('  Me@Example.COM ')).toBe('me@example.com');
  });

  it('refuses something that is not an address', () => {
    expect(subscriberEmailSchema.safeParse('not an email').success).toBe(false);
  });

  it('refuses an address too long to deliver', () => {
    expect(subscriberEmailSchema.safeParse(`${'a'.repeat(250)}@x.io`).success).toBe(false);
  });
});
