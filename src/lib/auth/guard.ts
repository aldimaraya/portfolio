import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './session';

/**
 * Returns `null` when the caller is authenticated, or a 401 to return as-is when
 * it is not — so call sites read:
 *
 *   const denied = await requireSession();
 *   if (denied) return denied;
 */
export async function requireSession(): Promise<NextResponse | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? '';
  const valid = await verifySessionToken(token);
  return valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** For server components that want to branch on auth rather than reject. */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value ?? '');
}
