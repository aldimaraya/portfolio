import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { devAuthBypassEnabled } from '@/lib/auth/dev-bypass';

/**
 * Auth gate for /admin/*. In Next.js 16 this file must be named `proxy.ts` and
 * the export must be named `proxy` — `middleware.ts` / `middleware` is
 * deprecated. Its runtime is Node and is not configurable.
 */
export async function proxy(request: NextRequest) {
  if (devAuthBypassEnabled()) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? '';
  if (await verifySessionToken(token)) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};
