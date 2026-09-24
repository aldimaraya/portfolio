import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * RFC 8058 one-click unsubscribe — the target of every digest's
 * List-Unsubscribe header, which is what puts an "Unsubscribe" button in the
 * mail client's own UI. Gmail and Yahoo expect it from anyone sending in bulk.
 *
 * Only POST acts. Mail scanners follow every link with a GET, and a GET that
 * unsubscribed would quietly remove people who never asked; the RFC requires
 * the POST for exactly that reason. A GET — someone pasting the header URL
 * into a browser — is sent to the manage page, where leaving is one click.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (token && token.length <= 64) {
    try {
      await db.subscriber.deleteMany({ where: { token } });
    } catch (cause) {
      console.error('Newsletter: one-click unsubscribe failed', cause);
      return NextResponse.json({ error: 'Try again later' }, { status: 500 });
    }
  }
  // 200 whether or not the token matched: an already-removed subscriber
  // clicking twice has got what they asked for, and nothing here should tell a
  // caller which tokens exist.
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const target = new URL('/newsletter/manage', request.url);
  if (token) target.searchParams.set('token', token);
  return NextResponse.redirect(target, 303);
}
