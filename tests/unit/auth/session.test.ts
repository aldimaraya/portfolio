// @vitest-environment node
//
// jose is Web Crypto based and checks `instanceof Uint8Array`. Under jsdom the
// typed arrays come from a different realm, so that check fails spuriously.
// Session handling is server-side code, so node is the honest environment here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  authEnv: () => ({
    SESSION_SECRET: 'x'.repeat(32),
    ADMIN_PASSWORD_HASH: '$2a$10$abcdefghijklmnopqrstuv',
  }),
}));

const { createSessionToken, verifySessionToken } = await import('@/lib/auth/session');

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

  it('rejects a token signed with a different secret', async () => {
    const { SignJWT } = await import('jose');
    const foreign = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode('y'.repeat(32)));

    expect(await verifySessionToken(foreign)).toBe(false);
  });
});
