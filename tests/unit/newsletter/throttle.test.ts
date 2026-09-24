import { beforeEach, describe, it, expect } from 'vitest';
import { allowSignup, MAX_SIGNUPS, resetSignupThrottle, SIGNUP_WINDOW_MS } from '@/lib/newsletter/throttle';

describe('allowSignup', () => {
  beforeEach(resetSignupThrottle);

  it('allows up to the cap, then refuses', () => {
    for (let i = 0; i < MAX_SIGNUPS; i++) expect(allowSignup('1.2.3.4', 0)).toBe(true);
    expect(allowSignup('1.2.3.4', 0)).toBe(false);
  });

  it('counts each source separately', () => {
    for (let i = 0; i < MAX_SIGNUPS; i++) allowSignup('1.2.3.4', 0);
    expect(allowSignup('5.6.7.8', 0)).toBe(true);
  });

  it('gives the slots back when the window closes', () => {
    for (let i = 0; i < MAX_SIGNUPS; i++) allowSignup('1.2.3.4', 0);
    expect(allowSignup('1.2.3.4', SIGNUP_WINDOW_MS)).toBe(true);
  });
});
