import { db } from '@/lib/db';

/**
 * One past the last published clip on a roll — where a new, moved or freshly
 * published clip lands. Drafts are left out: they are not on the roll anyone
 * sees, and a draft's sortOrder is whatever it was created with. Here rather
 * than in either actions file because both need it, and every export of a
 * 'use server' file is a public endpoint.
 */
export async function nextSortOrder(rollId: string): Promise<number> {
  const last = await db.video.findFirst({
    where: { rollId, draft: false },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}
