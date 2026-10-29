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
import {
  clipFieldsSchema,
  clipUploadSchema,
  publishProblems,
  stillFieldsSchema,
  stillUploadSchema,
  youtubeIdOf,
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
 * video is stored as none while the clip is a draft — the field keeps what was
 * pasted, and publishProblems refuses to publish until it reads.
 */
function clipColumns({ title, description, youtubeUrl, rollId }: ClipFields) {
  return { title, description, youtubeId: youtubeIdOf(youtubeUrl) ?? '', rollId: rollId || null };
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
 * the roll it landed on so the queue's select agrees with the row.
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
 * Announced here and not on upload: a draft is not news until it is out.
 * Clips go to the end of their roll in the order given, which is queue order.
 */
export async function publishDrafts(input: z.infer<typeof publishSchema>): Promise<Result<PublishResult>> {
  return attempt('publishDrafts', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };
    const parsed = publishSchema.safeParse(input);
    if (!parsed.success) return { error: 'Nothing to publish' };

    const published: string[] = [];
    const refused: PublishResult['refused'] = [];

    const stills = await db.photo.findMany({
      where: { id: { in: parsed.data.stills }, draft: true },
      select: { id: true, location: true, camera: true },
    });
    for (const id of parsed.data.stills) {
      const row = stills.find((still) => still.id === id);
      if (!row) {
        refused.push({ id, error: 'No longer a draft' });
        continue;
      }
      const problems = publishProblems({ kind: 'still', fields: row });
      if (problems.length) {
        refused.push({ id, error: `Needs ${problems.join(' and ')}` });
        continue;
      }
      // createdAt moves to the moment it went live: "added this week", the
      // home page's newest strip and the sitemap all mean on the site, not
      // sitting in the queue.
      await db.photo.update({ where: { id }, data: { draft: false, createdAt: new Date() } });
      await announce('stills', id);
      published.push(id);
    }

    const clips = await db.video.findMany({
      where: { id: { in: parsed.data.clips }, draft: true },
      select: { id: true, title: true, rollId: true, youtubeId: true },
    });
    for (const id of parsed.data.clips) {
      const row = clips.find((clip) => clip.id === id);
      if (!row) {
        refused.push({ id, error: 'No longer a draft' });
        continue;
      }
      // The stored id is already parsed, so it stands in for the link here.
      const problems = publishProblems({
        kind: 'clip',
        fields: { title: row.title, rollId: row.rollId ?? '', youtubeUrl: row.youtubeId },
      });
      if (problems.length || !row.rollId) {
        refused.push({ id, error: `Needs ${problems.join(' and ') || 'a roll'}` });
        continue;
      }
      const last = await db.video.findFirst({
        where: { rollId: row.rollId, draft: false },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      await db.video.update({
        where: { id },
        data: { draft: false, sortOrder: (last?.sortOrder ?? -1) + 1, createdAt: new Date() },
      });
      await announce('motion', id);
      published.push(id);
    }

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
