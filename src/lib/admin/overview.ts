import { db } from '@/lib/db';
import type { ContentKind } from '@/lib/newsletter/kinds';

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

/** "5 stills · 1 clip · 1 post" — stills first, as the email lays them out; empty kinds left out. */
export function batchSummary(items: { kind: ContentKind }[]): string {
  const order: ContentKind[] = ['stills', 'motion', 'journal'];
  return order
    .map((kind) => [kind, items.filter((item) => item.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => kindCount(kind, count))
    .join(' · ');
}

/**
 * The start of the UTC day six days before `now`, so "last 7 days" of View rows
 * is today plus the six before it. Views are stored by UTC day, not instant.
 */
export function weekStartDay(now: Date): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - 6);
  return day;
}

/** Days in the Overview's window: today and the six before it. */
export const WEEK_DAYS = 7;

/**
 * Distinct visitors per day, oldest first and ending today, with a zero for a
 * day nobody came — the query only returns days that have rows.
 */
export function dailySeries(rows: { day: Date; visitors: number }[], now: Date): number[] {
  const start = weekStartDay(now).getTime();
  const series = new Array<number>(WEEK_DAYS).fill(0);
  for (const row of rows) {
    const index = Math.round((row.day.getTime() - start) / (24 * 60 * 60 * 1000));
    if (index >= 0 && index < WEEK_DAYS) series[index] = row.visitors;
  }
  return series;
}

const MOST_VIEWED = 5;

export type WeekEngagement = {
  views: number;
  /**
   * Visitor-days: distinct visitors each day, summed. Not weekly uniques — the
   * view hash is keyed per day (lib/engagement/visitor.ts) precisely so one
   * person's Monday and Tuesday cannot be matched, and someone who came back
   * counts once for each day. Only readers who opened a clip or a post appear;
   * the wall records no views.
   */
  visitors: number;
  /** `visitors` split by day, oldest first; see dailySeries. */
  daily: number[];
  likes: number;
  subscribers: number;
  /** The single most-liked item this week, by likes given this week. */
  mostLiked: { kind: ContentKind; title: string; likes: number } | null;
  /** Clips and posts by views this week. Stills have no views to rank. */
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
