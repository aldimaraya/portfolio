import { describe, it, expect } from 'vitest';
import { cleanHref, linkIcon, linkSchema, profileUrls } from '@/lib/links/link';

describe('linkIcon', () => {
  it('recognises each supported host', () => {
    expect(linkIcon('https://www.youtube.com/@aldisfilmroll')).toBe('youtube');
    expect(linkIcon('https://youtu.be/abc')).toBe('youtube');
    expect(linkIcon('https://github.com/aldimaraya')).toBe('github');
    expect(linkIcon('https://www.instagram.com/someone')).toBe('instagram');
    expect(linkIcon('https://vimeo.com/someone')).toBe('vimeo');
  });

  it('matches subdomains and ignores case', () => {
    expect(linkIcon('https://m.YouTube.com/@x')).toBe('youtube');
  });

  // A suffix match on the bare string would hand this the YouTube mark.
  it('does not match a host that merely ends in a supported name', () => {
    expect(linkIcon('https://notyoutube.com/x')).toBeNull();
    expect(linkIcon('https://youtube.com.evil.test/x')).toBeNull();
  });

  it('returns null for an unknown host or an unparseable URL', () => {
    expect(linkIcon('https://shop.example.test')).toBeNull();
    expect(linkIcon('not a url')).toBeNull();
  });
});

describe('cleanHref', () => {
  it("drops YouTube's share-tracking id and the bare ? it leaves", () => {
    expect(cleanHref('https://youtube.com/@aldisfilmroll?si=KdMVEB6ByFJHC3gn')).toBe(
      'https://youtube.com/@aldisfilmroll',
    );
  });

  it('drops utm_ and Instagram share parameters but keeps real ones', () => {
    expect(cleanHref('https://example.test/p?utm_source=x&igsh=y&page=2')).toBe(
      'https://example.test/p?page=2',
    );
  });
});

describe('profileUrls', () => {
  it('keeps only profiles, in order', () => {
    expect(
      profileUrls([
        { label: 'A', href: 'https://a.test', profile: true },
        { label: 'Shop', href: 'https://shop.test', profile: false },
        { label: 'B', href: 'https://b.test', profile: true },
      ]),
    ).toEqual(['https://a.test', 'https://b.test']);
  });
});

describe('linkSchema', () => {
  const valid = { label: ' YouTube ', href: ' https://youtube.com/@x?si=1 ', profile: true };

  it('trims, and cleans the URL on the way in', () => {
    expect(linkSchema.parse(valid)).toEqual({
      label: 'YouTube',
      href: 'https://youtube.com/@x',
      profile: true,
    });
  });

  // The href is rendered on every public page; these would run or misbehave there.
  it.each(['javascript:alert(1)', 'mailto:a@b.test', 'ftp://example.test', 'https://localhost'])(
    'refuses %s',
    (href) => {
      expect(linkSchema.safeParse({ ...valid, href }).success).toBe(false);
    },
  );

  it('refuses a blank label', () => {
    expect(linkSchema.safeParse({ ...valid, label: '   ' }).success).toBe(false);
  });
});
