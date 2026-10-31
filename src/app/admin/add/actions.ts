'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { attempt } from '@/lib/actions/errors';
import { announce } from '@/lib/newsletter/queue';
import { MOTION_LAYOUT } from '@/lib/revalidate';
import { pruneUnusedTags, tagConnections } from '@/lib/tags';
import { deleteObjectsByUrl } from '@/lib/storage/r2';
import { inputValueToTakenAt } from '@/lib/photo/date';
import { nextSortOrder } from '@/lib/video/roll-order';
import {
  clipFieldsSchema,
  clipUploadSchema,
  draftYoutubeColumn,
  publishProblems,
  stillFieldsSchema,
  stillUploadSchema,
  type ClipFields,
  type StillFields,
} from '@/lib/admin/drafts';

/*
 * The Add media queue's writes. Every row made here starts as a draft — off the
 * site, out of the libraries — and only publishDrafts puts it live, which is
 * also where the newsletter hears about it. Each action re-checks the session:
 * server actions are public endpoints whatever page rendered the form.
 */

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

/** The row's columns for a still's typed fields. */
function stillColumns({ title, location, camera, settings, takenAt }: StillFields) {
  return { title, location, camera, settings, takenAt: inputValueToTakenAt(takenAt) };
}

/**
 * The row's columns for a clip's typed fields. A link that is not to a YouTube
 * video is stored as pasted while the clip is a draft — see draftYoutubeColumn
 * — so publish, reading the row, refuses it rather than publishing no link.
 */
function clipColumns({ title, description, youtubeUrl, rollId }: ClipFields) {
  return { title, description, youtubeId: draftYoutubeColumn(youtubeUrl), rollId: rollId || null };
}

const createStillSchema = z.object({ upload: stillUploadSchema, fields: stillFieldsSchema });

export async function createDraftStill(
  input: z.input<typeof createStillSchema>,
): Promise<Result<{ id: string }>> {
  return attempt('createDraftStill', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = createStillSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { upload, fields } = parsed.data;
    const created = await db.photo.create({
      data: {
        ...upload,
        ...stillColumns(fields),
        draft: true,
        tags: { create: await tagConnections(fields.tags) },
      },
      select: { id: true },
    });
    return { id: created.id };
  });
}

const createClipSchema = z.object({ upload: clipUploadSchema, fields: clipFieldsSchema });

/**
 * Files the clip on the roll it names, or on the first roll when it names none
 * — the same default the old form offered, since most uploads go there. Returns
 * the roll it landed on so the queue's select agrees with the row. A named roll
 * deleted since it was picked is not an error here: the files are already in
 * R2, and refusing would only upload them again on retry. The draft is filed
 * on no roll, and the queue sees rollId '' and asks for another.
 */
export async function createDraftClip(
  input: z.input<typeof createClipSchema>,
): Promise<Result<{ id: string; rollId: string }>> {
  return attempt('createDraftClip', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = createClipSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { upload, fields } = parsed.data;
    const roll = fields.rollId
      ? await db.roll.findUnique({ where: { id: fields.rollId }, select: { id: true } })
      : await db.roll.findFirst({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } });

    const created = await db.video.create({
      data: {
        ...upload,
        ...clipColumns({ ...fields, rollId: roll?.id ?? '' }),
        draft: true,
        tags: { create: await tagConnections(fields.tags) },
      },
      select: { id: true },
    });
    return { id: created.id, rollId: roll?.id ?? '' };
  });
}

/**
 * The queue's autosave. Refuses a published row, so a stale tab cannot use the
 * queue's lenient rules to blank out the place of a photo already on the wall.
 */
export async function saveDraftStill(id: string, fields: StillFields): Promise<Result> {
  return attempt('saveDraftStill', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = stillFieldsSchema.safeParse(fields);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const row = await db.photo.findUnique({ where: { id }, select: { draft: true } });
    if (!row) return { error: 'That photo no longer exists' };
    if (!row.draft) return { error: 'Already published — edit it in Stills' };

    const connections = await tagConnections(parsed.data.tags);
    // One transaction, as in savePhotoDetails: a tag delete that lands without its
    // update leaves the draft untagged with no sign of it.
    await db.$transaction([
      db.photoTag.deleteMany({ where: { photoId: id } }),
      db.photo.update({ where: { id }, data: { ...stillColumns(parsed.data), tags: { create: connections } } }),
    ]);
    await pruneUnusedTags();
    return {};
  });
}

export async function saveDraftClip(id: string, fields: ClipFields): Promise<Result> {
  return attempt('saveDraftClip', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = clipFieldsSchema.safeParse(fields);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const row = await db.video.findUnique({ where: { id }, select: { draft: true } });
    if (!row) return { error: 'That clip no longer exists' };
    if (!row.draft) return { error: 'Already published — edit it in Motion' };
    if (parsed.data.rollId) {
      const roll = await db.roll.findUnique({ where: { id: parsed.data.rollId }, select: { id: true } });
      if (!roll) return { error: 'That roll no longer exists — pick another' };
    }

    const connections = await tagConnections(parsed.data.tags);
    await db.$transaction([
      db.videoTag.deleteMany({ where: { videoId: id } }),
      db.video.update({ where: { id }, data: { ...clipColumns(parsed.data), tags: { create: connections } } }),
    ]);
    await pruneUnusedTags();
    return {};
  });
}

const publishSchema = z.object({
  stills: z.array(z.string().min(1)).max(500),
  clips: z.array(z.string().min(1)).max(500),
});

export type PublishResult = { published: string[]; refused: { id: string; error: string }[] };

/**
 * Puts a batch live. Each draft is checked against the stored row rather than
 * what the queue last showed — an autosave that failed would otherwise publish
 * a photo the client believes has a place and the database knows has none.
 * Refused drafts stay drafts and are reported; the rest go up regardless, so
 * one unfinished photo does not hold back twenty finished ones.
 *
 * Batched rather than one row at a time: a queue of a few hundred stills was
 * hundreds of sequential round trips, enough to run into the function's time
 * limit halfway and leave the batch half live with no result to say which half.
 * Stills are one update, clips one transaction, after one end-of-roll lookup
 * per roll.
 *
 * Announced here and not on upload: a draft is not news until it is out.
 * Clips go to the end of their roll in the order given, which is queue order.
 */
export async function publishDrafts(input: z.infer<typeof publishSchema>): Promise<Result<PublishResult>> {
  return attempt('publishDrafts', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = publishSchema.safeParse(input);
    if (!parsed.success) return { error: 'Nothing to publish' };

    const refused: PublishResult['refused'] = [];
    // createdAt moves to the moment it went live: "added this week", the home
    // page's newest strip and the sitemap all mean on the site, not sitting in
    // the queue.
    const now = new Date();

    const stills = await db.photo.findMany({
      where: { id: { in: parsed.data.stills }, draft: true },
      select: { id: true, location: true, camera: true },
    });
    const liveStills: string[] = [];
    for (const id of parsed.data.stills) {
      const row = stills.find((still) => still.id === id);
      if (!row) {
        refused.push({ id, error: 'No longer a draft' });
        continue;
      }
      const problems = publishProblems({ kind: 'still', fields: row });
      if (problems.length) refused.push({ id, error: `Needs ${problems.join(' and ')}` });
      else liveStills.push(id);
    }
    if (liveStills.length) {
      // draft: true again in the filter, so a row published by another tab
      // since the read is not given a second createdAt.
      await db.photo.updateMany({ where: { id: { in: liveStills }, draft: true }, data: { draft: false, createdAt: now } });
      await announce('stills', liveStills);
    }

    const clips = await db.video.findMany({
      where: { id: { in: parsed.data.clips }, draft: true },
      select: { id: true, title: true, rollId: true, youtubeId: true },
    });
    const liveClips: { id: string; rollId: string }[] = [];
    for (const id of parsed.data.clips) {
      const row = clips.find((clip) => clip.id === id);
      if (!row) {
        refused.push({ id, error: 'No longer a draft' });
        continue;
      }
      // The column is the id, '' or a bad link as pasted; youtubeIdOf reads all three.
      const problems = publishProblems({
        kind: 'clip',
        fields: { title: row.title, rollId: row.rollId ?? '', youtubeUrl: row.youtubeId },
      });
      if (problems.length || !row.rollId) refused.push({ id, error: `Needs ${problems.join(' and ') || 'a roll'}` });
      else liveClips.push({ id, rollId: row.rollId });
    }
    if (liveClips.length) {
      const ends = new Map<string, number>();
      for (const rollId of new Set(liveClips.map((clip) => clip.rollId))) ends.set(rollId, await nextSortOrder(rollId));
      await db.$transaction(
        liveClips.map(({ id, rollId }) => {
          const sortOrder = ends.get(rollId)!;
          ends.set(rollId, sortOrder + 1);
          return db.video.update({ where: { id }, data: { draft: false, sortOrder, createdAt: now } });
        }),
      );
      await announce('motion', liveClips.map((clip) => clip.id));
    }

    const published = [...liveStills, ...liveClips.map((clip) => clip.id)];
    if (published.length) {
      revalidatePath('/admin', 'layout');
      revalidatePath('/stills');
      revalidatePath(MOTION_LAYOUT, 'layout');
      revalidatePath('/');
    }
    return { published, refused };
  });
}

/**
 * Drops a draft and its objects. Only drafts: deleting something published
 * belongs to its library, which also clears its likes and views.
 */
export async function discardDraft(kind: 'still' | 'clip', id: string): Promise<Result> {
  return attempt('discardDraft', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    let objects: string[];
    if (kind === 'still') {
      const row = await db.photo.findUnique({ where: { id }, select: { draft: true, imageUrl: true } });
      if (!row) return {};
      if (!row.draft) return { error: 'Already published — delete it from Stills' };
      await db.photo.delete({ where: { id } });
      objects = [row.imageUrl];
    } else {
      const row = await db.video.findUnique({
        where: { id },
        select: { draft: true, videoUrl: true, posterImageUrl: true, spriteUrl: true },
      });
      if (!row) return {};
      if (!row.draft) return { error: 'Already published — delete it from Motion' };
      await db.video.delete({ where: { id } });
      objects = [row.videoUrl, row.posterImageUrl, row.spriteUrl];
    }

    // Row first, then objects — see deletePhoto for why that order.
    try {
      await deleteObjectsByUrl(objects);
    } catch (cause) {
      console.error('R2 cleanup failed for discarded draft', kind, id, objects, cause);
    }
    await pruneUnusedTags();
    revalidatePath('/admin', 'layout');
    return {};
  });
}
