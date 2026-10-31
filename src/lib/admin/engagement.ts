import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { CONTENT_KINDS, type ContentKind } from '@/lib/newsletter/kinds';

/**
 * The Engagement page: the Overview's week of numbers, opened out to a chosen
 * range and surface and set beside the range before it. Server-only apart from
 * the pure helpers, which the page and the tests share.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export type Surface = 'all' | ContentKind;
export const SURFACES: { key: Surface; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stills', label: 'Stills' },
  { key: 'motion', label: 'Motion' },
  { key: 'journal', label: 'Journal' },
];

export type Ranking = 'likes' | 'views';

export type EngagementQuery = { days: Range; surface: Surface; sort: Ranking };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The page's state, read from its query string so a view of it can be linked
 * to — the same reason the public filters live there. Anything unrecognised
 * falls back to the default rather than erroring: these are hand-editable URLs.
 */
export function parseEngagementQuery(params: Record<string, string | string[] | undefined>): EngagementQuery {
  const days = Number(first(params.days));
  const surface = first(params.surface);
  return {
    days: (RANGES as readonly number[]).includes(days) ? (days as Range) : 30,
    surface: surface === 'stills' || surface === 'motion' || surface === 'journal' ? surface : 'all',
    sort: first(params.sort) === 'views' ? 'views' : 'likes',
  };
}

/** The query string for a view of the page, defaults left out so the plain URL stays plain. */
export function engagementHref(query: EngagementQuery): string {
  const params = new URLSearchParams();
  if (query.days !== 30) params.set('days', String(query.days));
  if (query.surface !== 'all') params.set('surface', query.surface);
  if (query.sort !== 'likes') params.set('sort', query.sort);
  const search = params.toString();
  return search ? `/admin/engagement?${search}` : '/admin/engagement';
}

/**
 * Midnight UTC `days - 1` days before `now`, so a range of N days is today and
 * the N - 1 before it. Views are stored by UTC day, not instant, so every window
 * here starts on one.
 */
export function windowStart(now: Date, days: number): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - (days - 1));
  return day;
}

/** The index of the day `at` falls on, counted from `start`; out of range is the caller's to check. */
function dayIndex(at: Date, start: Date): number {
  return Math.floor((at.getTime() - start.getTime()) / DAY_MS);
}

/**
 * Distinct visitors per day, oldest first, with a zero for a day nobody came —
 * the query only returns days that have rows.
 */
export function daySeries(rows: { day: Date; visitors: number }[], start: Date, days: number): number[] {
  const series = new Array<number>(days).fill(0);
  for (const row of rows) {
    const index = dayIndex(row.day, start);
    if (index >= 0 && index < days) series[index] = row.visitors;
  }
  return series;
}

/** Which days of the window a newsletter went out on, as flags beside daySeries. */
export function markedDays(times: Date[], start: Date, days: number): boolean[] {
  const marks = new Array<boolean>(days).fill(false);
  for (const at of times) {
    const index = dayIndex(at, start);
    if (index >= 0 && index < days) marks[index] = true;
  }
  return marks;
}

/**
 * "+12%", "−3%", "0%" against the range before. Null when there was nothing
 * before to compare with: a percentage rise from zero is infinite, and "new"
 * would mislead on a site whose views only began being recorded recently.
 */
export function change(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return '0%';
  // A real minus sign, so it lines up with the plus in a tabular column.
  return percent > 0 ? `+${percent}%` : `−${-percent}%`;
}

/**
 * Likes per hundred views, to one decimal: "4.2%". Null without views: a like
 * on something nobody viewed in the range — liked from an old tab, or a still
 * liked from the wall's popular sort — would otherwise divide by zero.
 */
export function likeRate(likes: number, views: number | null): string | null {
  if (!views) return null;
  return `${Math.round((likes / views) * 1000) / 10}%`;
}

const TOP = 10;

export type TopItem = {
  kind: ContentKind;
  id: string;
  title: string;
  /** "Motion · Korea 2025" — the surface, and the roll for a clip. */
  detail: string;
  likes: number;
  views: number;
  /** A still's image or a clip's poster; a post draws an icon. */
  image: string | null;
  /** A still's average colour, shown while its image loads. */
  swatch: { avgHue: number; avgChroma: number; avgLightness: number } | null;
};

export type Engagement = {
  start: Date;
  /** Views in the range — a still's being the lightbox resting on it (see VIEWABLE). */
  views: { now: number; before: number };
  /** Visitor-days: see WeekEngagement.visitors in overview.ts. */
  visitors: { now: number; before: number };
  likes: { now: number; before: number };
  /** Not split by surface — a subscriber signs up to the site, not to one part of it. */
  subscribers: { now: number; before: number };
  daily: number[];
  /** Days a newsletter went out, aligned with `daily`. */
  sends: boolean[];
  /** Every surface's likes in the range, whatever surface is selected. */
  likesBySurface: Record<ContentKind, number>;
  top: TopItem[];
};

export async function loadEngagement(
  { days, surface, sort }: EngagementQuery,
  now: Date = new Date(),
): Promise<Engagement> {
  const start = windowStart(now, days);
  const before = new Date(start.getTime() - days * DAY_MS);
  const kind = surface === 'all' ? {} : { kind: surface };
  // Raw SQL takes the filter as a fragment: Prisma's groupBy cannot count
  // distinct values, and these are counts of distinct visitors.
  const kindSql = surface === 'all' ? Prisma.empty : Prisma.sql`AND "kind" = ${surface}::"ContentKind"`;

  const [viewsNow, viewsBefore, perDay, visitorsBefore, likesNow, likesBefore, subsNow, subsBefore, bySurface, sent, top] =
    await Promise.all([
      db.view.count({ where: { ...kind, day: { gte: start } } }),
      db.view.count({ where: { ...kind, day: { gte: before, lt: start } } }),
      db.$queryRaw<{ day: Date; visitors: number }[]>`
        SELECT "day", COUNT(DISTINCT "visitor")::int AS "visitors"
        FROM "View" WHERE "day" >= ${start}::date ${kindSql} GROUP BY "day"`,
      db.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS "count" FROM (
          SELECT DISTINCT "day", "visitor" FROM "View"
          WHERE "day" >= ${before}::date AND "day" < ${start}::date ${kindSql}
        ) AS "days"`,
      db.like.count({ where: { ...kind, createdAt: { gte: start } } }),
      db.like.count({ where: { ...kind, createdAt: { gte: before, lt: start } } }),
      db.subscriber.count({ where: { confirmedAt: { gte: start } } }),
      db.subscriber.count({ where: { confirmedAt: { gte: before, lt: start } } }),
      db.like.groupBy({ by: ['kind'], where: { createdAt: { gte: start } }, _count: { _all: true } }),
      db.dispatch.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      loadTop(surface, sort, start),
    ]);

  const daily = daySeries(perDay, start, days);
  const likesBySurface = Object.fromEntries(CONTENT_KINDS.map((k) => [k, 0])) as Record<ContentKind, number>;
  for (const row of bySurface) likesBySurface[row.kind] = row._count._all;

  return {
    start,
    views: { now: viewsNow, before: viewsBefore },
    visitors: { now: daily.reduce((sum, count) => sum + count, 0), before: visitorsBefore[0]?.count ?? 0 },
    likes: { now: likesNow, before: likesBefore },
    subscribers: { now: subsNow, before: subsBefore },
    daily,
    sends: markedDays(
      sent.map((row) => row.createdAt),
      start,
      days,
    ),
    likesBySurface,
    top,
  };
}

/**
 * The most liked or most viewed items in the range, each with the other count
 * beside it. Ranked by one table, then the other is counted for just those
 * items, so the ranking is never cut short by the second table's own top N.
 */
async function loadTop(surface: Surface, sort: Ranking, start: Date): Promise<TopItem[]> {
  const kind = surface === 'all' ? {} : { kind: surface };
  const likesWhere = { ...kind, createdAt: { gte: start } };
  const viewsWhere = { ...kind, day: { gte: start } };
  // Spare rows, because a top item may be deleted content whose engagement the
  // delete action failed to clear (see forgetEngagement).
  const take = TOP + 5;

  const ranked =
    sort === 'likes'
      ? await db.like.groupBy({
          by: ['kind', 'refId'],
          where: likesWhere,
          _count: { _all: true },
          orderBy: [{ _count: { refId: 'desc' } }, { refId: 'asc' }],
          take,
        })
      : await db.view.groupBy({
          by: ['kind', 'refId'],
          where: viewsWhere,
          _count: { _all: true },
          orderBy: [{ _count: { refId: 'desc' } }, { refId: 'asc' }],
          take,
        });
  if (!ranked.length) return [];

  const ids = ranked.map((row) => row.refId);
  const ofKind = (k: ContentKind) => ranked.filter((row) => row.kind === k).map((row) => row.refId);
  const [others, photos, videos, posts] = await Promise.all([
    sort === 'likes'
      ? db.view.groupBy({ by: ['refId'], where: { ...viewsWhere, refId: { in: ids } }, _count: { _all: true } })
      : db.like.groupBy({ by: ['refId'], where: { ...likesWhere, refId: { in: ids } }, _count: { _all: true } }),
    db.photo.findMany({
      where: { id: { in: ofKind('stills') } },
      select: {
        id: true,
        title: true,
        location: true,
        imageUrl: true,
        avgHue: true,
        avgChroma: true,
        avgLightness: true,
      },
    }),
    db.video.findMany({
      where: { id: { in: ofKind('motion') } },
      select: { id: true, title: true, posterImageUrl: true, roll: { select: { name: true } } },
    }),
    db.blogPost.findMany({ where: { id: { in: ofKind('journal') } }, select: { id: true, title: true } }),
  ]);

  const other = new Map(others.map((row) => [row.refId, row._count._all]));
  const photo = new Map(photos.map((p) => [p.id, p]));
  const video = new Map(videos.map((v) => [v.id, v]));
  const post = new Map(posts.map((p) => [p.id, p]));

  const items: TopItem[] = [];
  for (const row of ranked) {
    const count = row._count._all;
    const second = other.get(row.refId) ?? 0;
    const likes = sort === 'likes' ? count : second;
    const views = sort === 'views' ? count : second;
    const base = { kind: row.kind, id: row.refId, likes, views };
    if (row.kind === 'stills') {
      const p = photo.get(row.refId);
      if (!p) continue;
      const { avgHue, avgChroma, avgLightness } = p;
      const swatch = { avgHue, avgChroma, avgLightness };
      items.push({ ...base, title: p.title || p.location, detail: 'Stills', image: p.imageUrl, swatch });
    } else if (row.kind === 'motion') {
      const v = video.get(row.refId);
      if (!v) continue;
      const detail = v.roll ? `Motion · ${v.roll.name}` : 'Motion';
      items.push({ ...base, title: v.title, detail, image: v.posterImageUrl, swatch: null });
    } else {
      const p = post.get(row.refId);
      if (!p) continue;
      items.push({ ...base, title: p.title, detail: 'Journal', image: null, swatch: null });
    }
  }
  return items.slice(0, TOP);
}
