import { SignJWT, jwtVerify } from 'jose';
import { authEnv } from '@/lib/env';

/**
 * Session tokens, signed with `jose` (Web Crypto based). Keep bcrypt out of this
 * module: session verification runs on every /admin request via the proxy gate,
 * so it has to stay cheap and portable.
 */

export const SESSION_COOKIE = 'portfolio_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_TTL = '7d';

function secret(): Uint8Array {
  return new TextEncoder().encode(authEnv().SESSION_SECRET);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === 'admin';
  } catch {
    // Expired, tampered, wrong secret, or not a JWT at all — all the same answer.
    return false;
  }
}
