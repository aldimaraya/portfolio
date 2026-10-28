import { beforeEach, describe, it, expect } from 'vitest';
import { allowWrite, BUDGETS, resetWriteThrottle } from '@/lib/engagement/throttle';

describe('allowWrite', () => {
  beforeEach(resetWriteThrottle);

  it('allows up to the cap, then refuses', () => {
    for (let i = 0; i < BUDGETS.like.max; i++) expect(allowWrite('like', '1.2.3.4', 0)).toBe(true);
    expect(allowWrite('like', '1.2.3.4', 0)).toBe(false);
  });

  it('counts each source separately', () => {
    for (let i = 0; i < BUDGETS.like.max; i++) allowWrite('like', '1.2.3.4', 0);
    expect(allowWrite('like', '5.6.7.8', 0)).toBe(true);
  });

  it('keeps likes and views on separate budgets', () => {
    for (let i = 0; i < BUDGETS.like.max; i++) allowWrite('like', '1.2.3.4', 0);
    expect(allowWrite('view', '1.2.3.4', 0)).toBe(true);
  });

  it('gives the budget back when the window closes', () => {
    for (let i = 0; i < BUDGETS.like.max; i++) allowWrite('like', '1.2.3.4', 0);
    expect(allowWrite('like', '1.2.3.4', BUDGETS.like.windowMs)).toBe(true);
  });
});
