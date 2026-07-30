import { describe, it, expect } from 'vitest';
import { NAV_TABS, SITE_NAME, SITE_TAGLINE } from '@/lib/site';

describe('site config', () => {
  it('exposes a site name', () => {
    expect(SITE_NAME.length).toBeGreaterThan(0);
  });

  it('exposes a tagline', () => {
    expect(SITE_TAGLINE.length).toBeGreaterThan(0);
  });

  it('exposes the three public tabs', () => {
    expect(NAV_TABS.map((tab) => tab.href)).toEqual(['/stills', '/motion', '/journal']);
  });
});
