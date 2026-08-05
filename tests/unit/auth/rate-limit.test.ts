import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_FAILURES,
  WINDOW_MS,
  checkRateLimit,
  clearFailures,
  clientKey,
  recordFailure,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

// Module state is a process-wide Map by design, so every test starts by clearing
// it rather than by importing a fresh copy.
beforeEach(() => resetRateLimit());

describe('checkRateLimit', () => {
  it('allows an address that has never failed', () => {
    expect(checkRateLimit('1.2.3.4', 0)).toEqual({ allowed: true });
  });

  it('allows attempts right up to the limit', () => {
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) recordFailure('1.2.3.4', 0);
    expect(checkRateLimit('1.2.3.4', 0).allowed).toBe(true);
  });

  it('locks out once the limit is reached', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure('1.2.3.4', 0);

    const verdict = checkRateLimit('1.2.3.4', 0);
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.retryAfterSeconds).toBe(WINDOW_MS / 1000);
  });

  it('lets the address back in once the window closes', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure('1.2.3.4', 0);
    expect(checkRateLimit('1.2.3.4', WINDOW_MS).allowed).toBe(true);
  });

  it('throttles each address independently', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure('1.2.3.4', 0);
    expect(checkRateLimit('5.6.7.8', 0).allowed).toBe(true);
  });
});

describe('recordFailure', () => {
  it('re-arms the window on each failure, so a slow trickle still locks out', () => {
    // Just inside the window every time: a fixed window would let this run
    // forever, since the count would age out before it ever reached the limit.
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure('1.2.3.4', i * (WINDOW_MS - 1));

    const last = (MAX_FAILURES - 1) * (WINDOW_MS - 1);
    expect(checkRateLimit('1.2.3.4', last).allowed).toBe(false);
  });

  it('starts a fresh count after the previous window expired', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure('1.2.3.4', 0);
    recordFailure('1.2.3.4', WINDOW_MS * 2);
    expect(checkRateLimit('1.2.3.4', WINDOW_MS * 2).allowed).toBe(true);
  });
});

describe('clearFailures', () => {
  it('resets an address that then gets the password right', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure('1.2.3.4', 0);
    clearFailures('1.2.3.4');
    expect(checkRateLimit('1.2.3.4', 0).allowed).toBe(true);
  });
});

describe('clientKey', () => {
  it('takes the first x-forwarded-for entry, not the last', () => {
    // A forged header arrives as `evil, real` — trusting the last entry would let
    // the attacker pick their own bucket on every request.
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 70.0.0.1' });
    expect(clientKey(headers)).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip', () => {
    expect(clientKey(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('buckets unattributable requests together rather than exempting them', () => {
    expect(clientKey(new Headers())).toBe('unknown');
  });

  it('ignores an empty x-forwarded-for', () => {
    expect(clientKey(new Headers({ 'x-forwarded-for': '' }))).toBe('unknown');
  });
});
