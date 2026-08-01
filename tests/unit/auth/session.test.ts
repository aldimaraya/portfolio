// @vitest-environment node
//
// jose is Web Crypto based and checks `instanceof Uint8Array`. Under jsdom the
// typed arrays come from a different realm, so that check fails spuriously.
// Session handling is server-side code, so node is the honest environment here.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';

const SECRET = 'x'.repeat(32);
const PASSWORD_HASH = '$2a$12$abcdefghijklmnopqrstuv';

/**
 * Mutable so a test can change the password hash and re-import the module, which
 * is the only way to observe that the signing key is derived from it.
 */
const env = vi.hoisted(() => ({
  current: { SESSION_SECRET: 'x'.repeat(32), ADMIN_PASSWORD_HASH: '$2a$12$abcdefghijklmnopqrstuv' },
}));

vi.mock('@/lib/env', () => ({ authEnv: () => env.current }));

async function loadSession() {
  vi.resetModules();
  return import('@/lib/auth/session');
}

/**
 * The same derivation the module performs, so a hand-built token is signed with
 * the key the module will actually verify against. Without this, tests that mean
 * to check a claim would pass merely because the key did not match.
 */
async function signingKey(secret: string, passwordHash: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(passwordHash),
      info: encoder.encode('portfolio session key v1'),
    },
    material,
    256,
  );
  return new Uint8Array(bits);
}

let createSessionToken: () => Promise<string>;
let verifySessionToken: (token: string) => Promise<boolean>;

beforeEach(async () => {
  env.current = { SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: PASSWORD_HASH };
  ({ createSessionToken, verifySessionToken } = await loadSession());
});

describe('session tokens', () => {
  it('accepts a token it just issued', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(`${token}x`)).toBe(false);
  });

  it('rejects an empty token', async () => {
    expect(await verifySessionToken('')).toBe(false);
  });

  it('rejects arbitrary text', async () => {
    expect(await verifySessionToken('not.a.jwt')).toBe(false);
  });

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(0)
      .setIssuer('portfolio')
      .setAudience('portfolio-admin')
      .setExpirationTime(1)
      .sign(await signingKey(SECRET, PASSWORD_HASH));

    expect(await verifySessionToken(expired)).toBe(false);
  });

  // The point of pinning issuer and audience: a token signed with the right key
  // for some other purpose must not authenticate as a session.
  it('rejects a correctly signed token issued for something else', async () => {
    const foreign = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('some-other-service')
      .setAudience('some-other-audience')
      .setExpirationTime('7d')
      .sign(await signingKey(SECRET, PASSWORD_HASH));

    expect(await verifySessionToken(foreign)).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const foreign = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('portfolio')
      .setAudience('portfolio-admin')
      .setExpirationTime('7d')
      .sign(await signingKey('y'.repeat(32), PASSWORD_HASH));

    expect(await verifySessionToken(foreign)).toBe(false);
  });
});

describe('revocation by password change', () => {
  /**
   * The reason the signing key is derived from the password hash at all: after a
   * leak, changing the password is what everybody reaches for, and it has to be
   * enough on its own. Before this, tokens stayed valid for their full seven days
   * unless SESSION_SECRET was also rotated.
   */
  it('rejects a token issued under the previous password', async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);

    env.current = { SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: '$2a$12$adifferenthashvalue00' };
    const reloaded = await loadSession();

    expect(await reloaded.verifySessionToken(token)).toBe(false);
  });

  it('still accepts tokens issued under the new password', async () => {
    env.current = { SESSION_SECRET: SECRET, ADMIN_PASSWORD_HASH: '$2a$12$adifferenthashvalue00' };
    const reloaded = await loadSession();

    const token = await reloaded.createSessionToken();
    expect(await reloaded.verifySessionToken(token)).toBe(true);
  });
});
