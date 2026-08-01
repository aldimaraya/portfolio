import { describe, expect, it } from 'vitest';
import { DEFAULT_NEXT, safeNextPath } from '@/lib/auth/next-path';

describe('safeNextPath', () => {
  it('keeps a path on this site', () => {
    expect(safeNextPath('/admin/photos')).toBe('/admin/photos');
  });

  it('keeps the query string and hash', () => {
    expect(safeNextPath('/admin/photos?camera=Leica#top')).toBe(
      '/admin/photos?camera=Leica#top',
    );
  });

  it('falls back when nothing was asked for', () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNextPath('')).toBe(DEFAULT_NEXT);
  });

  it('takes the first value when the parameter is repeated', () => {
    expect(safeNextPath(['/admin/videos', '/admin/posts'])).toBe('/admin/videos');
  });

  it('rejects an absolute URL to another host', () => {
    expect(safeNextPath('https://evil.example/admin')).toBe(DEFAULT_NEXT);
  });

  it('rejects a protocol-relative host', () => {
    expect(safeNextPath('//evil.example')).toBe(DEFAULT_NEXT);
  });

  // The case a startsWith('/') && !startsWith('//') check lets through: browsers
  // normalise backslashes to forward slashes for special schemes, so this
  // resolves to https://evil.example.
  it('rejects a backslash-smuggled host', () => {
    expect(safeNextPath('/\\evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNextPath('\\\\evil.example')).toBe(DEFAULT_NEXT);
  });

  it('rejects a javascript: URL', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe(DEFAULT_NEXT);
  });
});
