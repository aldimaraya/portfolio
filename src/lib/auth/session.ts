import { SignJWT, jwtVerify } from 'jose';
import { authEnv } from '@/lib/env';

/**
 * Session tokens, signed with `jose` (Web Crypto based). Keep bcrypt out of this
 * module: session verification runs on every /admin request via the proxy gate,
 * so it has to stay cheap and portable. The password *hash* is read here as key
 * material — see deriveKey — but bcrypt itself is never called, so that stays
 * true.
 */

export const SESSION_COOKIE = 'portfolio_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_TTL = '7d';

/**
 * Issuer and audience are checked as well as the signature, so a token signed
 * with this secret for some other purpose cannot be replayed as a session. With
 * one secret and one consumer today that is belt and braces — the point is that
 * it stays true if the secret is ever reused.
 */
const ISSUER = 'portfolio';
const AUDIENCE = 'portfolio-admin';

/** The only algorithm this module issues, and the only one it will accept. */
const ALGORITHM = 'HS256';

/** Domain separation, so this key could never collide with another use of HKDF. */
const KEY_INFO = 'portfolio session key v1';

const encoder = new TextEncoder();

/**
 * The signing key, derived from the session secret *and* the admin password
 * hash rather than from the secret alone.
 *
 * That coupling is the whole point: changing the password changes the bcrypt
 * hash (its salt is regenerated), which changes this key, which invalidates
 * every token ever issued under the old password. Without it these tokens are
 * unrevocable for their full seven days, and "change the password" — the one
 * move anyone reaches for after a leak — would not lock anybody out.
 *
 * HKDF rather than hashing the two together: it is the primitive built for
 * turning key material into a key, and it costs one extra argument to say so.
 */
async function deriveKey(): Promise<Uint8Array> {
  const { SESSION_SECRET, ADMIN_PASSWORD_HASH } = authEnv();

  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_SECRET),
    'HKDF',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      // The password hash is public-ish config rather than a secret, which is
      // exactly what a salt is meant to be.
      salt: encoder.encode(ADMIN_PASSWORD_HASH),
      info: encoder.encode(KEY_INFO),
    },
    material,
    256,
  );

  return new Uint8Array(bits);
}

/**
 * Derivation runs once per process. Both inputs come from the environment, so
 * they cannot change without a restart — and verification happens on every
 * /admin request, where an extra HKDF pass would be pure waste.
 */
let cachedKey: Promise<Uint8Array> | null = null;

function secret(): Promise<Uint8Array> {
  cachedKey ??= deriveKey();
  return cachedKey;
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(SESSION_TTL)
    .sign(await secret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    // `algorithms` is pinned here rather than left to jose's key-type inference:
    // the guarantee that nothing but HS256 is accepted should be visible in this
    // file, not a property of a dependency's internals.
    const { payload } = await jwtVerify(token, await secret(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload.role === 'admin';
  } catch {
    // Expired, tampered, wrong secret, or not a JWT at all — all the same answer.
    return false;
  }
}
