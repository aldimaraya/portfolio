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

const { buildObjectKey, publicUrl } = await import('@/lib/storage/r2');

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
