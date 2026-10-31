import { randomUUID } from 'node:crypto';
import { placeholderColor } from '@/lib/color/analyze';
import { db } from '@/lib/db';
import { postExcerpt } from '@/lib/post/excerpt';
import { siteUrl } from '@/lib/site-url';
import {
  contentFor,
  isEmpty,
  renderDigest,
  type DigestContent,
  type DigestLayout,
} from './digest';
import { DEFAULT_PREFERENCES, type ContentKind, type Preferences } from './kinds';
import { byPosition, sectionOrder } from './layout';
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
 * Takes a batch too, so publishing a queue is one insert rather than one per item.
 * `skipDuplicates` is what makes this safe to call on every publish: an item is
 * only ever announced once (the unique index on kind + refId).
 */
export async function announce(kind: ContentKind, refIds: string | string[]): Promise<void> {
  const ids = typeof refIds === 'string' ? [refIds] : refIds;
  if (!ids.length) return;
  try {
    await db.announcement.createMany({ data: ids.map((refId) => ({ kind, refId })), skipDuplicates: true });
  } catch (cause) {
    console.error('Newsletter: could not queue', kind, ids, cause);
  }
}

type AnnouncementRow = { id: string; kind: ContentKind; refId: string; createdAt: Date; position: number | null };

/**
 * Where an announcement stands once looked up: `live` is sendable, `held` is a
 * post that has gone back to draft (kept pending in case it is republished),
 * `missing` is deleted content.
 */
export type ItemState = 'live' | 'held' | 'missing';

/** A still or a clip's poster, for the admin's queue. Posts have none. */
export interface BatchThumb {
  url: string;
  width: number;
  height: number;
  /** Shown while the image loads; a clip has no colour stats. */
  color: string | null;
}

export interface BatchItem {
  announcementId: string;
  kind: ContentKind;
  refId: string;
  title: string;
  createdAt: Date;
  state: ItemState;
  thumb: BatchThumb | null;
  /** The roll a clip is on, so two clips of the same name can be told apart. */
  roll: string | null;
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
      select: { id: true, title: true, slug: true, content: true, markdownContent: true, draft: true },
    }),
    db.video.findMany({
      where: { id: { in: refs('motion') } },
      select: {
        id: true,
        title: true,
        description: true,
        posterImageUrl: true,
        width: true,
        height: true,
        roll: { select: { name: true } },
      },
    }),
    db.photo.findMany({
      where: { id: { in: refs('stills') } },
      select: {
        id: true,
        imageUrl: true,
        width: true,
        height: true,
        title: true,
        location: true,
        takenAt: true,
        avgHue: true,
        avgChroma: true,
        avgLightness: true,
      },
    }),
  ]);

  const postById = new Map(posts.map((post) => [post.id, post]));
  const clipById = new Map(clips.map((clip) => [clip.id, clip]));
  const photoById = new Map(photos.map((photo) => [photo.id, photo]));

  const content: DigestContent = { journal: [], motion: [], stills: [] };
  const items: BatchItem[] = [];
  let newest: Date | null = null;

  // Rows arrive oldest first; the ones placed by hand go first, in their places,
  // and the rest follow in the order they were published.
  for (const row of byPosition(rows)) {
    let title = '';
    let state: ItemState = 'missing';
    let thumb: BatchThumb | null = null;
    let roll: string | null = null;

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
            excerpt: postExcerpt(post),
          });
        }
      }
    } else if (row.kind === 'motion') {
      const clip = clipById.get(row.refId);
      if (clip) {
        title = clip.title;
        state = 'live';
        // Clips stored before width/height existed are 0×0; 16:9 is what most are.
        thumb = { url: clip.posterImageUrl, width: clip.width || 16, height: clip.height || 9, color: null };
        roll = clip.roll?.name ?? null;
        content.motion.push(clip);
      }
    } else {
      const photo = photoById.get(row.refId);
      if (photo) {
        title = photo.title || photo.location;
        state = 'live';
        thumb = { url: photo.imageUrl, width: photo.width, height: photo.height, color: placeholderColor(photo) };
        content.stills.push(photo);
      }
    }

    if (state === 'live' && (!newest || row.createdAt > newest)) newest = row.createdAt;
    items.push({
      announcementId: row.id,
      kind: row.kind,
      refId: row.refId,
      title,
      createdAt: row.createdAt,
      state,
      thumb,
      roll,
    });
  }

  return { items, content, newest };
}

const announcementSelect = { id: true, kind: true, refId: true, createdAt: true, position: true } as const;

/** The draft row's id — there is only ever one next email. */
const DRAFT_ID = 'next';

export interface Draft {
  message: string;
  sections: ContentKind[];
}

/** The next email's note and section order, with the defaults when never saved. */
export async function loadDraft(): Promise<Draft> {
  const row = await db.newsletterDraft.findUnique({ where: { id: DRAFT_ID } });
  return { message: row?.message ?? '', sections: sectionOrder(row?.sections) };
}

export async function saveDraft(data: Partial<Draft>): Promise<void> {
  await db.newsletterDraft.upsert({ where: { id: DRAFT_ID }, create: { id: DRAFT_ID, ...data }, update: data });
}

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
  //
  // The note goes with this email and no further, so it is cleared in the same
  // transaction — but only if it is still the text copied, so a note being
  // rewritten at this moment is kept for the next email rather than lost.
  const id = randomUUID();
  const draft = await loadDraft();
  const live = pending.items.filter((item) => item.state === 'live').map((item) => item.announcementId);
  const [dispatch, claimed] = await db.$transaction([
    db.dispatch.create({ data: { id, message: draft.message, sections: draft.sections } }),
    db.announcement.updateMany({
      where: { id: { in: live }, dispatchId: null },
      data: { dispatchId: id },
    }),
    db.newsletterDraft.updateMany({
      where: { id: DRAFT_ID, message: draft.message },
      data: { message: '' },
    }),
  ]);

  // Two runs racing (a cron retry, or "Send now" at the same moment) both get
  // here, but only one can claim the items. The loser backs out before it
  // touches a single subscriber. It cannot have taken the note either: the
  // claim blocks until the winner commits, and by then the note is cleared.
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
  layout: DigestLayout,
): OutgoingEmail {
  const rendered = renderDigest(
    content,
    subscriber,
    {
      site,
      manage: manageUrl(site, subscriber.token),
    },
    layout,
  );
  return { to: subscriber.email, ...rendered, headers: unsubscribeHeaders(site, subscriber.token) };
}

async function deliver(dispatch: {
  id: string;
  createdAt: Date;
  message: string;
  sections: ContentKind[];
}): Promise<DispatchReport> {
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
      return isEmpty(theirs) ? [] : [digestEmail(theirs, subscriber, site, dispatch)];
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
 * emailed preview. `manageFor` builds the manage link from the site origin; the
 * default is a stand-in, since a preview has no subscriber behind it.
 */
export async function renderPendingPreview(
  manageFor: (site: string) => string = (site) => `${site}/newsletter`,
) {
  const [{ content }, draft] = await Promise.all([pendingBatch(), loadDraft()]);
  const [preview] = await renderPreviews(content, draft, [DEFAULT_PREFERENCES], manageFor);
  return preview;
}

/**
 * The batch as each set of choices would get it, null where those choices get
 * nothing — the admin's "Preview as". Takes the batch already resolved, since
 * the page needs it for the queue anyway.
 */
export async function renderPreviews(
  content: DigestContent,
  layout: DigestLayout,
  choices: Preferences[],
  manageFor: (site: string) => string = (site) => `${site}/newsletter`,
) {
  const site = await linkOrigin();
  return choices.map((prefs) => {
    const theirs = contentFor(content, prefs);
    return isEmpty(theirs)
      ? null
      : renderDigest(theirs, prefs, { site, images: siteUrl(), manage: manageFor(site) }, layout);
  });
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
