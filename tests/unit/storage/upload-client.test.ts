import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  splitIntoParts,
  uploadFile,
  shouldRetry,
  backoffDelay,
  PART_ATTEMPTS,
  MIN_PART_SIZE,
} from '@/lib/storage/upload-client';

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
    vi.stubGlobal('fetch', routes({ part: () => new Response('', { status: 503 }) }));

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(/503/);
  });

  it('refuses an empty file before it creates an upload', async () => {
    const fetchMock = routes({});
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new Blob([]), 'a.jpg', 'photos')).rejects.toThrow(/empty/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the route's error message instead of the bare status", async () => {
    vi.stubGlobal(
      'fetch',
      routes({
        create: () =>
          new Response(JSON.stringify({ error: 'Your session expired' }), { status: 401 }),
      }),
    );

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(
      /Your session expired/,
    );
  });

  it('falls back to the status when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      routes({ create: () => new Response('<html>Bad Gateway</html>', { status: 502 }) }),
    );

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(/502/);
  });

  it('retries a part that fails transiently and still completes', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      routes({
        part: () => {
          attempts += 1;
          return attempts < 3
            ? new Response('', { status: 503 })
            : new Response('', { status: 200, headers: { ETag: '"e"' } });
        },
      }),
    );

    const seen: number[] = [];
    const url = await uploadFile(new Blob(['hello']), 'a.jpg', 'photos', (p) => seen.push(p));
    expect(url).toBe('https://media.example.com/k');
    expect(attempts).toBe(3);
    // A retried part is credited once, when it finally lands.
    expect(seen).toEqual([100]);
  });

  it('re-signs the part URL on every attempt, since a presigned URL can expire', async () => {
    let partUrls = 0;
    vi.stubGlobal(
      'fetch',
      routes({
        partUrl: () => {
          partUrls += 1;
          return new Response(JSON.stringify({ url: 'https://r2.example/part' }));
        },
        part: () => new Response('', { status: 500 }),
      }),
    );

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(/500/);
    expect(partUrls).toBe(PART_ATTEMPTS);
  });

  it('does not retry a session that expired mid-upload', async () => {
    let attempts = 0;
    const fetchMock = routes({
      part: () => {
        attempts += 1;
        return new Response('', { status: 403 });
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(/403/);
    expect(attempts).toBe(1);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/api/upload/abort'))).toBe(
      true,
    );
  });

  it('does not retry a missing ETag, which no second attempt can produce', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      routes({
        part: () => {
          attempts += 1;
          return new Response('', { status: 200 });
        },
      }),
    );

    await expect(uploadFile(new Blob(['hi']), 'a.jpg', 'photos')).rejects.toThrow(/ETag/i);
    expect(attempts).toBe(1);
  });

  it('weights progress by bytes, so a short final part is not a whole step', async () => {
    vi.stubGlobal('fetch', routes({}));

    const seen: number[] = [];
    await uploadFile(
      new Blob([new Uint8Array(MIN_PART_SIZE * 2 + 100)]),
      'a.mp4',
      'videos',
      (p) => seen.push(p),
    );

    expect(seen).toHaveLength(3);
    expect(seen[0]).toBeLessThan(60);
    expect(seen[1] - seen[0]).toBeGreaterThan(seen[2] - seen[1]);
    expect(seen.at(-1)).toBe(100);
  });
});

describe('shouldRetry', () => {
  it('retries a fetch that never completed', () => {
    expect(shouldRetry(undefined)).toBe(true);
  });

  it('retries server-side and back-pressure statuses', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(shouldRetry(status)).toBe(true);
    }
  });

  it('gives up on a request that will never be accepted', () => {
    for (const status of [400, 401, 403, 404]) {
      expect(shouldRetry(status)).toBe(false);
    }
  });
});

describe('backoffDelay', () => {
  it('doubles from the base', () => {
    expect(backoffDelay(1, 300)).toBe(300);
    expect(backoffDelay(2, 300)).toBe(600);
    expect(backoffDelay(3, 300)).toBe(1200);
  });

  it('never exceeds the cap', () => {
    expect(backoffDelay(20, 300, 8000)).toBe(8000);
  });
});

/** Stub fetch for the four routes plus the R2 PUT, overriding only what a test cares about. */
function routes(overrides: {
  create?: () => Response;
  partUrl?: () => Response;
  part?: () => Response;
  complete?: () => Response;
}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/upload/create')) {
      return overrides.create?.() ?? new Response(JSON.stringify({ key: 'k', uploadId: 'u' }));
    }
    if (url.endsWith('/api/upload/part-url')) {
      return overrides.partUrl?.() ?? new Response(JSON.stringify({ url: 'https://r2.example/p' }));
    }
    if (url.endsWith('/api/upload/complete')) {
      return (
        overrides.complete?.() ??
        new Response(JSON.stringify({ url: 'https://media.example.com/k' }))
      );
    }
    if (url.endsWith('/api/upload/abort')) {
      return new Response(JSON.stringify({ ok: true }));
    }
    return overrides.part?.() ?? new Response('', { status: 200, headers: { ETag: '"e"' } });
  });
}
