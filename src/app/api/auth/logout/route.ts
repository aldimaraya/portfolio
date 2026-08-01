import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';

/**
 * Clearing a cookie needs no session, so this endpoint cannot be protected by
 * the usual auth check — which is exactly what would let any page on the web
 * POST here and sign the admin out. Comparing Origin to the request's own host
 * is the whole defence: a cross-site form carries the attacker's origin, and a
 * same-origin fetch carries ours.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  // Same-origin form posts and some non-browser clients omit Origin entirely.
  // Nothing is at stake behind this endpoint beyond a forced sign-out, so a
  // missing header is allowed rather than turning logout into a puzzle.
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin request' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
