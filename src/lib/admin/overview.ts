import { db } from '@/lib/db';
import type { ContentKind } from '@/lib/newsletter/kinds';
import { daySeries, windowStart } from './engagement';

/**
 * The Overview's numbers beyond the chrome's counts (lib/admin/counts.ts): what
 * the audience did this week and what went up most recently. Server-only apart
 * from the pure helpers, which the page and the tests share.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "1 still", "5 stills", "2 clips". The kinds' own labels are surface names ("Motion"), not things you count. */
const NOUNS: Record<ContentKind, [string, string]> = {
  stills: ['still', 'stills'],
  motion: ['clip', 'clips'],
  journal: ['post', 'posts'],
};

export function countOf(count: number, [one, many]: [string, string]): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function kindCount(kind: ContentKind, count: number): string {
  return countOf(count, NOUNS[kind]);
}

/**
 * "5 stills · 1 clip · 1 post" — always in this fixed order, whatever order the
 * email has been given, so summaries read alike; empty kinds left out.
 */
export function batchSummary(items: { kind: ContentKind }[]): string {
  const counts: Partial<Record<ContentKind, number>> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  return countsSummary(counts);
}

/** batchSummary for counts already tallied — a sent dispatch's, from a groupBy. */
export function countsSummary(counts: Partial<Record<ContentKind, number>>): string {
  const order: ContentKind[] = ['stills', 'motion', 'journal'];
  return order
    .filter((kind) => (counts[kind] ?? 0) > 0)
    .map((kind) => kindCount(kind, counts[kind]!))
    .join(' · ');
}

/** Days in the Overview's window: today and the six before it. */
export const WEEK_DAYS = 7;

/** The start of the UTC day six days before `now`; see windowStart. */
export function weekStartDay(now: Date): Date {
  return windowStart(now, WEEK_DAYS);
}

/** Distinct visitors per day over the Overview's week; see daySeries. */
export function dailySeries(rows: { day: Date; visitors: number }[], now: Date): number[] {
  return daySeries(rows, weekStartDay(now), WEEK_DAYS);
}

const MOST_VIEWED = 5;

export type WeekEngagement = {
  views: number;
  /**
   * Visitor-days: distinct visitors each day, summed. Not weekly uniques — the
   * view hash is keyed per day (lib/engagement/visitor.ts) precisely so one
   * person's Monday and Tuesday cannot be matched, and someone who came back
   * counts once for each day. A visitor appears once they open a clip or a
   * post, or rest the lightbox on a still (see VIEWABLE in lib/engagement/kinds).
   */
  visitors: number;
  /** `visitors` split by day, oldest first; see dailySeries. */
  daily: number[];
  likes: number;
  subscribers: number;
  /** The single most-liked item this week, by likes given this week. */
  mostLiked: { kind: ContentKind; title: string; likes: number } | null;
  /** Items of every kind by views this week — a still's being lightbox looks. */
  mostViewed: { kind: ContentKind; id: string; title: string; views: number }[];
};

export async function loadWeekEngagement(now: Date = new Date()): Promise<WeekEngagement> {
  const since = new Date(now.getTime() - WEEK_MS);
  const weekStart = weekStartDay(now);
  const [views, perDay, likes, subscribers, top, viewed] = await Promise.all([
    db.view.count({ where: { day: { gte: weekStart } } }),
    // Raw, because Prisma's groupBy cannot count distinct values: grouping by
    // (day, visitor) instead would ship every visitor-day row over the wire.
    db.$queryRaw<{ day: Date; visitors: number }[]>`
      SELECT "day", COUNT(DISTINCT "visitor")::int AS "visitors"
      FROM "View" WHERE "day" >= ${weekStart}::date GROUP BY "day"`,
    db.like.count({ where: { createdAt: { gte: since } } }),
    db.subscriber.count({ where: { confirmedAt: { gte: since } } }),
    db.like.groupBy({
      by: ['kind', 'refId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { refId: 'desc' } },
      // A few, because the top one may be deleted content whose likes the
      // delete action failed to clear.
      take: 5,
    }),
    db.view.groupBy({
      by: ['kind', 'refId'],
      where: { day: { gte: weekStart } },
      _count: { _all: true },
      orderBy: { _count: { refId: 'desc' } },
      // Spare rows for the same reason as above.
      take: MOST_VIEWED + 3,
    }),
  ]);

  let mostLiked: WeekEngagement['mostLiked'] = null;
  for (const row of top) {
    const title = await titleOf(row.kind, row.refId);
    if (title !== null) {
      mostLiked = { kind: row.kind, title, likes: row._count._all };
      break;
    }
  }

  // Looked up together rather than one by one like the single most-liked: a
  // full list would otherwise be up to eight round trips in a row.
  const titles = await Promise.all(viewed.map((row) => titleOf(row.kind, row.refId)));
  const mostViewed = viewed
    .map((row, i) => ({ kind: row.kind, id: row.refId, title: titles[i], views: row._count._all }))
    .filter((item): item is WeekEngagement['mostViewed'][number] => item.title !== null)
    .slice(0, MOST_VIEWED);

  const daily = dailySeries(perDay, now);
  const visitors = daily.reduce((sum, count) => sum + count, 0);
  return { views, visitors, daily, likes, subscribers, mostLiked, mostViewed };
}

/** Null for an item that no longer exists. */
async function titleOf(kind: ContentKind, id: string): Promise<string | null> {
  switch (kind) {
    case 'stills': {
      const photo = await db.photo.findUnique({ where: { id }, select: { title: true, location: true } });
      return photo ? photo.title || photo.location : null;
    }
    case 'motion':
      return (await db.video.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
    case 'journal':
      return (await db.blogPost.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
  }
}
