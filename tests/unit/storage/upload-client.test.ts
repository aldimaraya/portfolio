import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitIntoParts, uploadFile, MIN_PART_SIZE } from '@/lib/storage/upload-client';

describe('splitIntoParts', () => {
  it('returns a single part for a small file', () => {
    const parts = splitIntoParts(1000);
    expect(parts).toEqual([{ partNumber: 1, start: 0, end: 1000 }]);
  });

  it('splits into equal parts on an exact boundary', () => {
    const parts = splitIntoParts(MIN_PART_SIZE * 2, MIN_PART_SIZE);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({ partNumber: 2, start: MIN_PART_SIZE, end: MIN_PART_SIZE * 2 });
  });

  it('gives the remainder to a final short part', () => {
    const parts = splitIntoParts(MIN_PART_SIZE + 100, MIN_PART_SIZE);
    expect(parts).toHaveLength(2);
    expect(parts[1].end - parts[1].start).toBe(100);
  });

  it('numbers parts from one', () => {
    expect(splitIntoParts(MIN_PART_SIZE * 3, MIN_PART_SIZE).map((p) => p.partNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it('returns no parts for an empty file', () => {
    expect(splitIntoParts(0)).toEqual([]);
  });
});

describe('uploadFile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates, uploads every part, and completes', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/upload/create')) {
        return new Response(JSON.stringify({ key: 'photos/a.jpg', uploadId: 'u1' }));
      }
      if (url.endsWith('/api/upload/part-url')) {
        return new Response(JSON.stringify({ url: 'https://r2.example/part' }));
      }
      if (url.endsWith('/api/upload/complete')) {
        const body = JSON.parse(String(init?.body));
        expect(body.parts).toHaveLength(1);
        expect(body.parts[0].ETag).toBe('"etag-1"');
        return new Response(JSON.stringify({ url: 'https://media.example.com/photos/a.jpg' }));
      }
      return new Response('', { status: 200, headers: { ETag: '"etag-1"' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await uploadFile(new Blob(['hello']), 'a.jpg', 'photos');
    expect(url).toBe('https://media.example.com/photos/a.jpg');
  });

  it('reports progress reaching 100', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/upload/create')) {
          return new Response(JSON.stringify({ key: 'k', uploadId: 'u' }));
        }
        if (url.endsWith('/api/upload/part-url')) {
          return new Response(JSON.stringify({ url: 'https://r2.example/part' }));
        }
        if (url.endsWith('/api/upload/complete')) {
          return new Response(JSON.stringify({ url: 'https://media.example.com/k' }));
        }
        return new Response('', { status: 200, headers: { ETag: '"e"' } });
      }),
    );

    const seen: number[] = [];
    await uploadFile(new Blob(['hello']), 'a.jpg', 'photos', (pct) => seen.push(pct));
    expect(seen.at(-1)).toBe(100);
  });

  it('throws when a part upload returns no ETag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/upload/create')) {
          return new Response(JSON.stringify({ key: 'k', uploadId: 'u' }));
        }
        if (url.endsWith('/api/upload/part-url')) {
          return new Response(JSON.stringify({ url: 'https://r2.example/part' }));
        }
        return new Response('', { status: 200 });
      }),
    );

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(/ETag/i);
  });

  it('surfaces a failing part rather than completing the upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/upload/create')) {
          return new Response(JSON.stringify({ key: 'k', uploadId: 'u' }));
        }
        if (url.endsWith('/api/upload/part-url')) {
          return new Response(JSON.stringify({ url: 'https://r2.example/part' }));
        }
        if (url.endsWith('/api/upload/complete')) {
          throw new Error('complete should not be reached');
        }
        return new Response('', { status: 503 });
      }),
    );

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(/503/);
  });
});
