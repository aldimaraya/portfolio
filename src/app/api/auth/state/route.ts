import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/guard';

export const runtime = 'nodejs';
/** Reads a cookie, so it must never be prerendered or cached. */
export const dynamic = 'force-dynamic';

/**
 * Whether the caller is the admin, for the client-side chrome on public pages.
 *
 * The admin bar used to answer this on the server, which meant reading a cookie
 * inside the public layout — and a layout that reads cookies opts its whole
 * subtree out of static rendering. Every public page paid for a database round
 * trip so that a bar only one person ever sees could render in the first paint.
 * Asking from the client instead lets those pages come off the CDN.
 *
 * Returns a boolean and nothing else: it is reachable without a session, so it
 * must not describe one.
 */
export async function GET() {
  const admin = await isAuthenticated();

  return NextResponse.json(
    { admin },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
