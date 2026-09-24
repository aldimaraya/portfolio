import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { buildExcerpt } from '@/lib/excerpt';
import { siteUrl } from '@/lib/site-url';
import {
  contentFor,
  isEmpty,
  renderDigest,
  type DigestContent,
} from './digest';
import { DEFAULT_PREFERENCES, type ContentKind, type Preferences } from './kinds';
import { manageUrl, unsubscribeHeaders } from './links';
import { linkOrigin } from './origin';
import { estimatedSendTime, isQuiet, UNCONFIRMED_TTL_MS } from './schedule';
import {
  BATCH_LIMIT,
  batchKey,
  EmailError,
  isProductionDeployment,
  sendEmails,
  testRecipients,
  type OutgoingEmail,
} from './send';

/**
 * The newsletter's database side: queueing what was published, and sending the
 * queue as one Dispatch. Server-only. Rendering is in digest.ts and delivery in
 * send.ts; this module decides *what* goes out and *to whom*.
 */

/**
 * Queues an item to be emailed about. Called by the admin save actions after
 * the row exists, and deliberately unable to fail the save: the content is
 * already live by the time this runs, and telling the admin "save failed" for
 * something that saved would be the worse lie. A missed announcement is logged.
 *
 * `skipDuplicates` is what makes this safe to call on every publish: an item is
 * only ever announced once (the unique index on kind + refId).
 */
export async function announce(kind: ContentKind, refId: string): Promise<void> {
  try {
    await db.announcement.createMany({ data: [{ kind, refId }], skipDuplicates: true });
  } catch (cause) {
    console.error('Newsletter: could not queue', kind, refId, cause);
  }
}

type AnnouncementRow = { id: string; kind: ContentKind; refId: string; createdAt: Date };

/**
 * Where an announcement stands once looked up: `live` is sendable, `held` is a
 * post that has gone back to draft (kept pending in case it is republished),
 * `missing` is deleted content.
 */
export type ItemState = 'live' | 'held' | 'missing';

export interface BatchItem {
  announcementId: string;
  kind: ContentKind;
  refId: string;
  title: string;
  createdAt: Date;
  state: ItemState;
}

export interface ResolvedBatch {
  items: BatchItem[];
  /** The live items, shaped for the email. */
  content: DigestContent;
  /** When the newest live item was queued; null when nothing is live. */
  newest: Date | null;
}

async function resolve(rows: AnnouncementRow[]): Promise<ResolvedBatch> {
  const refs = (kind: ContentKind) => rows.filter((row) => row.kind === kind).map((row) => row.refId);

  const [posts, clips, photos] = await Promise.all([
    db.blogPost.findMany({
      where: { id: { in: refs('journal') } },
      select: { id: true, title: true, slug: true, markdownContent: true, draft: true },
    }),
    db.video.findMany({
      where: { id: { in: refs('motion') } },
      select: { id: true, title: true, description: true, posterImageUrl: true },
    }),
    db.photo.findMany({
      where: { id: { in: refs('stills') } },
      select: { id: true, imageUrl: true, width: true, height: true, title: true, location: true, takenAt: true },
    }),
  ]);

  const postById = new Map(posts.map((post) => [post.id, post]));
  const clipById = new Map(clips.map((clip) => [clip.id, clip]));
  const photoById = new Map(photos.map((photo) => [photo.id, photo]));

  const content: DigestContent = { journal: [], motion: [], stills: [] };
  const items: BatchItem[] = [];
  let newest: Date | null = null;

  // Rows arrive oldest first, so each section of the email reads in the order
  // things were published.
  for (const row of rows) {
    let title = '';
    let state: ItemState = 'missing';

    if (row.kind === 'journal') {
      const post = postById.get(row.refId);
      if (post) {
        title = post.title;
        state = post.draft ? 'held' : 'live';
        if (state === 'live') {
          content.journal.push({
            id: post.id,
            title: post.title,
            slug: post.slug,
            excerpt: buildExcerpt(post.markdownContent),
          });
        }
      }
    } else if (row.kind === 'motion') {
      const clip = clipById.get(row.refId);
      if (clip) {
        title = clip.title;
        state = 'live';
        content.motion.push(clip);
      }
    } else {
      const photo = photoById.get(row.refId);
      if (photo) {
        title = photo.title || photo.location;
        state = 'live';
        content.stills.push(photo);
      }
    }

    if (state === 'live' && (!newest || row.createdAt > newest)) newest = row.createdAt;
    items.push({ announcementId: row.id, kind: row.kind, refId: row.refId, title, createdAt: row.createdAt, state });
  }

  return { items, content, newest };
}

const announcementSelect = { id: true, kind: true, refId: true, createdAt: true } as const;

/** Everything queued and not yet sent or skipped. */
export async function pendingBatch(): Promise<ResolvedBatch> {
  const rows = await db.announcement.findMany({
    where: { dispatchId: null, skipped: false },
    select: announcementSelect,
    orderBy: { createdAt: 'asc' },
  });
  return resolve(rows);
}

/** Items taken out of the batch by hand and not yet sent, for the admin's undo. */
export async function skippedItems(): Promise<BatchItem[]> {
  const rows = await db.announcement.findMany({
    where: { dispatchId: null, skipped: true },
    select: announcementSelect,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return (await resolve(rows)).items.filter((item) => item.state !== 'missing');
}

export type DispatchReport =
  | { status: 'blocked' }
  | { status: 'idle' }
  | { status: 'waiting'; sendAfter: Date }
  | { status: 'sent'; dispatchId: string; sent: number }
  | { status: 'partial'; dispatchId: string; sent: number; error: string };

/**
 * Sends the pending batch if it has gone quiet (or `force`, from the admin's
 * "Send now"), resuming an unfinished dispatch first.
 *
 * Production only. Development and previews share production's database, and a
 * dispatch run from either would mark real subscribers as sent while the
 * environment guard in send.ts dropped every one of their emails — the batch
 * would be spent and nobody would get it.
 */
export async function runDispatch(options: { force?: boolean; now?: Date } = {}): Promise<DispatchReport> {
  if (!isProductionDeployment()) return { status: 'blocked' };
  const now = options.now ?? new Date();

  // One dispatch at a time. Starting a second while one is unfinished would
  // move `lastDispatchId` under the first and send its subscribers a repeat.
  const unfinished = await db.dispatch.findFirst({
    where: { completedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (unfinished) return deliver(unfinished);

  const pending = await pendingBatch();

  // Deleted content can never be sent; clear it out rather than carry it.
  const missing = pending.items.filter((item) => item.state === 'missing');
  if (missing.length) {
    await db.announcement.deleteMany({
      where: { id: { in: missing.map((item) => item.announcementId) } },
    });
  }

  if (!pending.newest) return { status: 'idle' };
  if (!options.force && !isQuiet(pending.newest, now)) {
    return { status: 'waiting', sendAfter: estimatedSendTime(pending.newest) };
  }

  // The id is minted here so the create and the claim can go in one array
  // transaction. Only live items are claimed; a held draft stays pending.
  const id = randomUUID();
  const live = pending.items.filter((item) => item.state === 'live').map((item) => item.announcementId);
  const [dispatch, claimed] = await db.$transaction([
    db.dispatch.create({ data: { id } }),
    db.announcement.updateMany({
      where: { id: { in: live }, dispatchId: null },
      data: { dispatchId: id },
    }),
  ]);

  // Two runs racing (a cron retry, or "Send now" at the same moment) both get
  // here, but only one can claim the items. The loser backs out before it
  // touches a single subscriber.
  if (claimed.count === 0) {
    await db.dispatch.delete({ where: { id } });
    return { status: 'idle' };
  }

  return deliver(dispatch);
}

function digestEmail(
  content: DigestContent,
  subscriber: Preferences & { email: string; token: string },
  site: string,
): OutgoingEmail {
  const rendered = renderDigest(content, subscriber, {
    site,
    manage: manageUrl(site, subscriber.token),
  });
  return { to: subscriber.email, ...rendered, headers: unsubscribeHeaders(site, subscriber.token) };
}

async function deliver(dispatch: { id: string; createdAt: Date }): Promise<DispatchReport> {
  const rows = await db.announcement.findMany({
    where: { dispatchId: dispatch.id },
    select: announcementSelect,
    orderBy: { createdAt: 'asc' },
  });
  const { content } = await resolve(rows);
  const site = siteUrl();
  let sent = 0;

  for (;;) {
    // Only people confirmed before the dispatch began: someone who signs up
    // halfway through a resumed send should not open their first email to news
    // from before they arrived. That also keeps this loop bounded.
    //
    // The OR is load-bearing — `{ not: id }` alone is SQL's `<>`, which is never
    // true of NULL, so it would silently skip everyone never sent anything.
    const subscribers = await db.subscriber.findMany({
      where: {
        confirmedAt: { not: null, lte: dispatch.createdAt },
        OR: [{ lastDispatchId: null }, { lastDispatchId: { not: dispatch.id } }],
      },
      select: { id: true, email: true, token: true, journal: true, motion: true, stills: true },
      orderBy: { id: 'asc' },
      take: BATCH_LIMIT,
    });
    if (!subscribers.length) break;

    const emails = subscribers.flatMap((subscriber) => {
      const theirs = contentFor(content, subscriber);
      return isEmpty(theirs) ? [] : [digestEmail(theirs, subscriber, site)];
    });

    let handed = 0;
    if (emails.length) {
      try {
        handed = await sendEmails(
          emails,
          batchKey(`dispatch-${dispatch.id}`, emails.map((email) => email.to)),
        );
      } catch (cause) {
        // Most often the provider's daily cap. Everyone not yet marked is
        // exactly who the next run will pick up.
        console.error('Newsletter: dispatch stopped partway', dispatch.id, cause);
        const error =
          cause instanceof EmailError && cause.status === 429
            ? 'The email provider’s sending limit was reached. The rest go out on the next run.'
            : 'The email provider refused the send. Details are in the server log.';
        return { status: 'partial', dispatchId: dispatch.id, sent, error };
      }
    }

    // Marked even when nothing matched their choices, so they are not looked at
    // again for this dispatch.
    await db.$transaction([
      db.subscriber.updateMany({
        where: { id: { in: subscribers.map((subscriber) => subscriber.id) } },
        data: { lastDispatchId: dispatch.id },
      }),
      db.dispatch.update({ where: { id: dispatch.id }, data: { sent: { increment: handed } } }),
    ]);
    sent += handed;
  }

  await db.dispatch.update({ where: { id: dispatch.id }, data: { completedAt: new Date() } });
  return { status: 'sent', dispatchId: dispatch.id, sent };
}

/**
 * The pending batch as a subscriber who wants everything would get it — for the
 * admin preview. `manageFor` builds the manage link from the site origin; the
 * default is a stand-in, since the admin iframe has no subscriber behind it.
 */
export async function renderPendingPreview(
  manageFor: (site: string) => string = (site) => `${site}/newsletter`,
) {
  const { content } = await pendingBatch();
  if (isEmpty(content)) return null;
  const site = await linkOrigin();
  return renderDigest(content, DEFAULT_PREFERENCES, { site, images: siteUrl(), manage: manageFor(site) });
}

/**
 * Emails the preview to NEWSLETTER_TEST_EMAIL. Works from development too — the
 * guard in send.ts allows exactly those addresses — which is how the digest can
 * be checked in a real inbox before anyone else sees it. Marks nothing as sent.
 *
 * A test address that is also a subscriber gets its own real manage link, so
 * the preferences page can be tested from the preview too; one that is not
 * falls back to the signup page.
 */
export async function sendPreview(): Promise<{ error?: string; sent?: number }> {
  const recipients = testRecipients();
  if (!recipients.length) return { error: 'Set NEWSLETTER_TEST_EMAIL to send yourself a preview.' };

  const subscribers = await db.subscriber.findMany({
    where: { email: { in: recipients } },
    select: { email: true, token: true },
  });
  const tokenFor = new Map(subscribers.map((subscriber) => [subscriber.email, subscriber.token]));

  const emails: OutgoingEmail[] = [];
  for (const to of recipients) {
    const token = tokenFor.get(to);
    const preview = await renderPendingPreview((site) =>
      token ? manageUrl(site, token) : `${site}/newsletter`,
    );
    if (!preview) return { error: 'Nothing is pending, so there is nothing to preview.' };
    emails.push({ to, ...preview, subject: `[Preview] ${preview.subject}` });
  }

  return { sent: await sendEmails(emails) };
}

/** Drops signups never confirmed, so a mistyped or unwanted address is not kept. */
export async function deleteStaleSignups(now: Date = new Date()): Promise<number> {
  const { count } = await db.subscriber.deleteMany({
    where: { confirmedAt: null, createdAt: { lt: new Date(now.getTime() - UNCONFIRMED_TTL_MS) } },
  });
  return count;
}
