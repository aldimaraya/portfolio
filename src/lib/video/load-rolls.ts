import { db } from '@/lib/db';

/**
 * The orderings /motion and /motion/[id] both read by. Shared rather than
 * written out twice because the two pages' numbering has to agree — see
 * groupIntoRolls. createdAt breaks ties, so two rows left on the same sortOrder
 * (a failed reorder, a hand edit) still come out the same way on both pages.
 */
export const CLIP_ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }] as const;

export function loadRolls() {
  return db.roll.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, description: true },
  });
}
