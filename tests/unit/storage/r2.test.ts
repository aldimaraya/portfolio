import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  storageEnv: () => ({
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'bucket',
    R2_PUBLIC_BASE_URL: 'https://media.example.com',
  }),
}));

const { buildObjectKey, publicUrl, objectKeyFromUrl } = await import('@/lib/storage/r2');

const BASE = 'https://media.example.com';

describe('objectKeyFromUrl', () => {
  it('recovers the key from a public URL', () => {
    expect(objectKeyFromUrl(`${BASE}/photos/shot-abc123.jpg`, BASE)).toBe(
      'photos/shot-abc123.jpg',
    );
  });

  it('round-trips whatever publicUrl produced', () => {
    const key = buildObjectKey('Blue Hour.JPG', 'photos');
    expect(objectKeyFromUrl(publicUrl(key), BASE)).toBe(key);
  });

  it('tolerates a trailing slash on the base', () => {
    expect(objectKeyFromUrl(`${BASE}/videos/clip.mov`, `${BASE}/`)).toBe('videos/clip.mov');
  });

  it('decodes percent-escaped keys', () => {
    expect(objectKeyFromUrl(`${BASE}/photos/blue%20hour.jpg`, BASE)).toBe(
      'photos/blue hour.jpg',
    );
  });

  it('drops a query string or fragment', () => {
    expect(objectKeyFromUrl(`${BASE}/photos/a.jpg?v=2`, BASE)).toBe('photos/a.jpg');
    expect(objectKeyFromUrl(`${BASE}/photos/a.jpg#top`, BASE)).toBe('photos/a.jpg');
  });

  // The delete path depends on this: anything not provably ours must be skipped
  // rather than turned into a key we then delete.
  it('refuses URLs that are not on our own base', () => {
    expect(objectKeyFromUrl('https://evil.example.com/photos/a.jpg', BASE)).toBeNull();
    expect(objectKeyFromUrl('https://media.example.com.evil.com/a.jpg', BASE)).toBeNull();
    expect(objectKeyFromUrl('', BASE)).toBeNull();
  });

  it('refuses the bare base with no key', () => {
    expect(objectKeyFromUrl(BASE, BASE)).toBeNull();
    expect(objectKeyFromUrl(`${BASE}/`, BASE)).toBeNull();
  });

  it('returns null for a malformed escape rather than guessing', () => {
    expect(objectKeyFromUrl(`${BASE}/photos/%E0%A4%A.jpg`, BASE)).toBeNull();
  });
});

describe('buildObjectKey', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  it('namespaces keys under the given prefix', () => {
    expect(buildObjectKey('shot.jpg', 'photos')).toMatch(/^photos\//);
  });

  it('preserves the file extension in lowercase', () => {
    expect(buildObjectKey('CLIP.MP4', 'videos')).toMatch(/\.mp4$/);
  });

  it('slugifies the base name', () => {
    expect(buildObjectKey('Tokyo Shinjuku #3.jpg', 'photos')).toContain('tokyo-shinjuku-3');
  });

  it('produces distinct keys for identical filenames', () => {
    const a = buildObjectKey('shot.jpg', 'photos');
    const b = buildObjectKey('shot.jpg', 'photos');
    expect(a).not.toBe(b);
  });

  it('handles a filename with no extension', () => {
    expect(buildObjectKey('noext', 'photos')).toMatch(/^photos\/noext-/);
  });
});

describe('publicUrl', () => {
  it('joins the public base and key', () => {
    expect(publicUrl('photos/a.jpg')).toBe('https://media.example.com/photos/a.jpg');
  });

  it('does not double the separator when the key has a leading slash', () => {
    expect(publicUrl('/photos/a.jpg')).toBe('https://media.example.com/photos/a.jpg');
  });
});
