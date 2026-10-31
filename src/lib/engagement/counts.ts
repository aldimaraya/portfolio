import { db } from '@/lib/db';
import type { ContentKind } from '@/lib/newsletter/kinds';
import { isViewable, type Target } from './kinds';

/**
 * The engagement tables' queries, shared by the /api/engagement handlers and
 * the delete actions. Server-only.
 */

/** One item's numbers, as a page draws them. `views` is absent for stills. */
export type Counts = { likes: number; views?: number; liked: boolean };

/** Every still's likes at once, for the lightbox — see GET /api/engagement. */
export type WallCounts = { likes: Record<string, number>; liked: string[] };

/**
 * Whether a target is something a visitor could actually be looking at. Checked
 * before a like is written, or anyone could fill the table with likes on ids
 * that were never published. A draft post 404s, so it is not a target either.
 */
export async function isPublicTarget({ kind, id }: Target): Promise<boolean> {
  switch (kind) {
    case 'stills':
      return (await db.photo.count({ where: { id, draft: false } })) > 0;
    case 'motion':
      return (await db.video.count({ where: { id, draft: false } })) > 0;
    case 'journal':
      return (await db.blogPost.count({ where: { id, draft: false } })) > 0;
  }
}

/** `visitor` is the hashed cookie, or null for someone who has never liked anything. */
export async function countsFor({ kind, id }: Target, visitor: string | null): Promise<Counts> {
  const [likes, views, mine] = await Promise.all([
    db.like.count({ where: { kind, refId: id } }),
    isViewable(kind) ? db.view.count({ where: { kind, refId: id } }) : null,
    visitor ? db.like.count({ where: { kind, refId: id, visitor } }) : 0,
  ]);
  return { likes, ...(views === null ? {} : { views }), liked: mine > 0 };
}

export async function wallCounts(visitor: string | null): Promise<WallCounts> {
  const [grouped, mine] = await Promise.all([
    db.like.groupBy({ by: ['refId'], where: { kind: 'stills' }, _count: { _all: true } }),
    visitor
      ? db.like.findMany({ where: { kind: 'stills', visitor }, select: { refId: true } })
      : [],
  ]);
  return {
    likes: Object.fromEntries(grouped.map((row) => [row.refId, row._count._all])),
    liked: mine.map((row) => row.refId),
  };
}

/**
 * Sets a like to the state asked for rather than flipping it, so two clicks
 * racing each other end where the visitor's last click left it — a toggle
 * would let the second request undo the first.
 */
export async function setLike({ kind, id }: Target, visitor: string, liked: boolean): Promise<void> {
  if (liked) {
    await db.like.createMany({ data: [{ kind, refId: id, visitor }], skipDuplicates: true });
  } else {
    await db.like.deleteMany({ where: { kind, refId: id, visitor } });
  }
}

/** One view per visitor per day; a second one that day is a no-op, not an error. */
export async function recordView(
  { kind, id }: Target,
  day: Date,
  visitor: string,
): Promise<void> {
  await db.view.createMany({ data: [{ kind, refId: id, day, visitor }], skipDuplicates: true });
}

/**
 * Drops a deleted item's likes and views. Called by the delete actions after
 * the content row has gone, and unable to fail them: the item is already
 * deleted, and rows left behind are invisible — nothing asks for counts by an
 * id that no page carries. A miss is logged, like an R2 orphan.
 */
export async function forgetEngagement(kind: ContentKind, refId: string): Promise<void> {
  try {
    await db.$transaction([
      db.like.deleteMany({ where: { kind, refId } }),
      db.view.deleteMany({ where: { kind, refId } }),
    ]);
  } catch (cause) {
    console.error('Engagement cleanup failed for deleted item', kind, refId, cause);
  }
}
