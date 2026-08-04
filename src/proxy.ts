import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/**
 * Auth gate for /admin/*. In Next.js 16 this file must be named `proxy.ts` and
 * the export must be named `proxy` — `middleware.ts` / `middleware` is
 * deprecated. Its runtime is Node and is not configurable.
 *
 * There is no development bypass, and there should not be one again: this ran
 * for months behind a `DEV_SKIP_AUTH` flag while the admin panel was being
 * built, and development points at the *live* Neon database and R2 bucket, so
 * the thing it left unguarded was always the real content.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? '';
  if (await verifySessionToken(token)) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};
