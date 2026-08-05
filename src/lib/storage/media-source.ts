import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { storageEnv } from '@/lib/env';
import { bucket, objectKeyFromUrl, r2 } from './r2';

/**
 * Serves a stored object back to the admin through our own origin, so a canvas
 * can read its pixels. Fetching it straight from the R2 public host would taint
 * the canvas unless the bucket happens to send CORS headers, and reading a
 * tainted canvas throws — a failure that would depend on bucket configuration
 * rather than on anything in this repo.
 *
 * Two callers, one for photos (the border trimmer needs `getImageData`) and one
 * for videos (regenerating a clip's scrub preview re-seeks the stored file), and
 * they differ only in what they say when the read fails.
 *
 * Behind the session check, and restricted to keys inside our own bucket, so it
 * cannot be used as an open proxy.
 */
export async function streamStoredObject(
  request: NextRequest,
  failure: string,
): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;

  const url = request.nextUrl.searchParams.get('url') ?? '';
  const key = objectKeyFromUrl(url, storageEnv().R2_PUBLIC_BASE_URL);
  if (!key) {
    return NextResponse.json({ error: 'Not an object in this bucket' }, { status: 400 });
  }

  try {
    const object = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!object.Body) {
      return NextResponse.json({ error: 'Empty object' }, { status: 502 });
    }

    return new Response(object.Body.transformToWebStream(), {
      headers: {
        'Content-Type': object.ContentType ?? 'application/octet-stream',
        // Admin-only and mutable — a cached copy would show the pre-trim image
        // after a trim has already been applied.
        'Cache-Control': 'no-store',
      },
    });
  } catch (cause) {
    console.error(failure, key, cause);
    return NextResponse.json({ error: failure }, { status: 502 });
  }
}
