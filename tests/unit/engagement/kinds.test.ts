import { describe, it, expect } from 'vitest';
import { isViewable, likeSchema, targetSchema, viewSchema } from '@/lib/engagement/kinds';

const ID = 'cmh1x2y3z4a5b6c7d8e9f0g1h';

describe('engagement kinds', () => {
  it('likes all three surfaces', () => {
    for (const kind of ['stills', 'motion', 'journal']) {
      expect(targetSchema.safeParse({ kind, id: ID }).success).toBe(true);
    }
  });

  it('counts views on clips and posts, not stills', () => {
    expect(isViewable('motion')).toBe(true);
    expect(isViewable('journal')).toBe(true);
    expect(isViewable('stills')).toBe(false);
    expect(viewSchema.safeParse({ kind: 'stills', id: ID }).success).toBe(false);
  });

  it('refuses ids that are not the shape of a row id', () => {
    for (const id of ['', 'x', 'a'.repeat(200), '../etc', "c' OR 1=1", ID.toUpperCase()]) {
      expect(targetSchema.safeParse({ kind: 'motion', id }).success).toBe(false);
    }
  });

  it('needs the state a like is being set to', () => {
    expect(likeSchema.safeParse({ kind: 'motion', id: ID }).success).toBe(false);
    expect(likeSchema.safeParse({ kind: 'motion', id: ID, liked: true }).success).toBe(true);
    expect(likeSchema.safeParse({ kind: 'motion', id: ID, liked: 'yes' }).success).toBe(false);
  });
});
