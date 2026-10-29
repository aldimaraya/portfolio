import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { deleteStaleSignups, runDispatch } from '@/lib/newsletter/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vercel Cron's daily call (schedule in vercel.json). Sends the pending batch
 * once it has gone quiet, resumes a dispatch that stopped partway, and clears
 * out week-old unconfirmed signups. Most days it finds nothing and returns.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. The route is otherwise a
 * public URL, and "Send now" belongs to the admin, so without the secret this
 * refuses — including when CRON_SECRET is unset, rather than letting an empty
 * secret match an empty header.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get('authorization') ?? '';
  // Hashed to equal lengths first: timingSafeEqual throws on a length mismatch,
  // and comparing lengths up front would leak the secret's length.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`));
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const removed = await deleteStaleSignups();
    const report = await runDispatch();
    console.log('Newsletter cron', { removedSignups: removed, ...report });
    // A partial send is a 500 so it shows as failed in the cron log — the rest
    // go out on the next run either way.
    return NextResponse.json({ removedSignups: removed, ...report }, {
      status: report.status === 'partial' ? 500 : 200,
    });
  } catch (cause) {
    console.error('Newsletter cron failed', cause);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
