import { describe, it, expect } from 'vitest';
import { editPhotoHref, withoutOpenPhoto } from '@/lib/photo/lightbox-link';
import { safeNextPath } from '@/lib/auth/next-path';

/** What the edit page will read back out of the link. */
function returnOf(href: string): string | null {
  return new URL(href, 'https://site.invalid').searchParams.get('return');
}

describe('editPhotoHref', () => {
  it('points at the photo form and returns to the bare wall with the photo open', () => {
    const href = editPhotoHref('abc', '');
    expect(href.startsWith('/admin/photos/abc?')).toBe(true);
    expect(returnOf(href)).toBe('/stills?photo=abc');
  });

  it('keeps the filters and sort the wall was showing', () => {
    const back = returnOf(editPhotoHref('abc', '?camera=Leica+M6&sort=random&seed=7'));
    const params = new URLSearchParams(back!.split('?')[1]);
    expect(params.get('camera')).toBe('Leica M6');
    expect(params.get('sort')).toBe('random');
    expect(params.get('seed')).toBe('7');
    expect(params.get('photo')).toBe('abc');
  });

  it('replaces a stale open-photo request rather than stacking a second one', () => {
    const back = returnOf(editPhotoHref('new', 'photo=old'));
    expect(new URLSearchParams(back!.split('?')[1]).getAll('photo')).toEqual(['new']);
  });

  it('survives the edit page’s redirect check unchanged', () => {
    const back = returnOf(editPhotoHref('abc', '?tag=night,street'))!;
    expect(safeNextPath(back, '/admin/photos')).toBe(back);
  });
});

describe('withoutOpenPhoto', () => {
  it('drops the request and keeps everything else', () => {
    expect(withoutOpenPhoto('?camera=Leica&photo=abc')).toBe('?camera=Leica');
  });

  it('leaves no dangling question mark when nothing else was set', () => {
    expect(withoutOpenPhoto('?photo=abc')).toBe('');
  });
});
