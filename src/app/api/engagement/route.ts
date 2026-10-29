import type { NextRequest } from 'next/server';
import { countsFor, wallCounts } from '@/lib/engagement/counts';
import { targetSchema } from '@/lib/engagement/kinds';
import { failed, json, visitorKey } from '@/lib/engagement/respond';

export const runtime = 'nodejs';
/** Reads a cookie and answers per visitor, so it must never be prerendered or cached. */
export const dynamic = 'force-dynamic';

/**
 * Counts for the public pages, asked for after hydration. The pages themselves
 * are static and come off the CDN; putting a like count in their HTML would
 * mean revalidating a page on every click, so the numbers are fetched instead.
 *
 * `?kind=stills` with no id is the whole wall at once, because the lightbox
 * moves from photo to photo and a request per photo would lag behind it. Clip
 * and post pages ask through POST /api/engagement/view instead, which records
 * the view and answers with these same numbers in one request.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    if (params.get('kind') === 'stills' && !params.has('id')) {
      return json(await wallCounts(visitorKey(request)));
    }

    const parsed = targetSchema.safeParse({ kind: params.get('kind'), id: params.get('id') });
    if (!parsed.success) return json({ error: 'Unknown item' }, 400);

    return json(await countsFor(parsed.data, visitorKey(request)));
  } catch (cause) {
    return failed('counts', cause);
  }
}
