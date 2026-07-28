import { describe, it, expect } from 'vitest';
import { SITE_NAME } from '@/lib/site';

describe('site config', () => {
  it('exposes a site name', () => {
    expect(SITE_NAME.length).toBeGreaterThan(0);
  });
});
