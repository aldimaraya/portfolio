'use server';

import { revalidatePath } from 'next/cache';
import { JOURNAL_LAYOUT, MOTION_LAYOUT } from '@/lib/revalidate';
import { z } from 'zod';
import { db } from '@/lib/db';
import { forgetEngagement } from '@/lib/engagement/counts';
import { isAuthenticated } from '@/lib/auth/guard';
import { pruneUnusedTags, tagConnections } from '@/lib/tags';
import { deleteObjectsByUrl } from '@/lib/storage/r2';
import { attempt } from '@/lib/actions/errors';
import { announce } from '@/lib/newsletter/queue';
import { youtubeId } from '@/lib/markdown/media';

const videoFields = z.object({
  id: z.string().optional(),
  videoUrl: z.url('Upload a video before saving'),
  posterImageUrl: z.url('The poster image failed to generate'),
  spriteUrl: z.url('The preview sprite failed to generate'),
  spriteFrames: z.number().int().positive(),
  // Shape the frame on the motion page; without them a clip is drawn 16:9. Not
  // `positive` here for the same reason as durationSeconds below: a clip stored
  // before these columns existed submits the 0 it already carries, and refusing
  // that made an unrelated edit — retitling, fixing a description — impossible
  // on exactly the rows that most needed fixing. 0 means unknown; the check
  // below still holds the line where it can actually be met.
  width: z.number().int().nonnegative('The clip dimensions could not be read'),
  height: z.number().int().nonnegative('The clip dimensions could not be read'),
  durationSeconds: z.number().nonnegative('The clip duration could not be read'),
  // Trimmed before the length check, so a lone space cannot pass as a value.
  title: z.string().trim().min(1, 'Title is required'),
  // Optional — not every clip needs a blurb.
  description: z.string().trim(),
  // Optional. Taken as whatever link was pasted and stored as the id alone — see
  // Video.youtubeId. Refused rather than dropped when no id can be read from it:
  // a channel or playlist link saved as "no link" would look like it had taken.
  // Parsed to the id here, once, so the check and the stored value cannot read
  // the link two different ways. A link copied without its scheme (youtu.be/ID)
  // is given one, since URL() will not parse it otherwise. Keeping only the id
  // also drops any &t= — the clip's link deliberately always starts at 0:00.
  youtubeUrl: z
    .string()
    .trim()
    .transform((url, context) => {
      if (!url) return '';
      const id = youtubeId(/^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`);
      if (id) return id;
      context.addIssue({ code: 'custom', message: 'That is not a link to a YouTube video' });
      return z.NEVER;
    }),
  // Required, though the column is nullable — see Video.rollId.
  rollId: z.string().min(1, 'Pick a roll'),
  tags: z.string(),
});

const videoSchema = videoFields
  // A *new* clip has just had its frames grabbed in the browser, which cannot
  // succeed without dimensions — so a 0 arriving on a create is a real fault
  // worth refusing, where a 0 arriving on an edit is only history.
  .refine((input) => Boolean(input.id) || (input.width > 0 && input.height > 0), {
    message: 'The clip dimensions could not be read',
    path: ['width'],
  });

export type VideoInput = z.infer<typeof videoSchema>;

// Picked from the fields rather than the refined schema: Zod will not pick from
// an object carrying a refinement, and the dimension check is a create's anyway.
const detailsSchema = videoFields
  .pick({ title: true, description: true, youtubeUrl: true, rollId: true, tags: true })
  .extend({ id: z.string().min(1) });

export type VideoDetailsInput = z.input<typeof detailsSchema>;

/**
 * One past the last clip on a roll. Not exported: every export of a 'use server'
 * file is a public endpoint.
 */
async function nextSortOrder(rollId: string): Promise<number> {
  const last = await db.video.findFirst({
    where: { rollId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

export async function saveVideo(input: VideoInput): Promise<{ error?: string }> {
  // Wrapped so a failure past validation still arrives as `{ error }` rather
  // than as a rejected promise the form cannot see — see lib/actions/errors.
  return attempt('saveVideo', async () => {
    // Server actions are publicly reachable endpoints — re-check auth here rather
    // than trusting that the proxy gate covered the page that rendered the form.
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = videoSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    // The schema has already reduced the pasted link to its id.
    const { id, tags, youtubeUrl: youtubeId, ...fields } = parsed.data;
    const data = { ...fields, youtubeId };

    // Checked rather than left to the foreign key, whose failure would reach the
    // form as the generic message: a roll deleted in another tab while this form
    // was open is a thing the admin can act on if told.
    const roll = await db.roll.findUnique({ where: { id: data.rollId }, select: { id: true } });
    if (!roll) return { error: 'That roll no longer exists — pick another' };

    const connections = await tagConnections(tags);

    if (id) {
      // Regenerating a preview uploads a fresh poster and strip under new keys, so
      // the ones this row used to point at become unreachable the moment the row
      // is updated — but only once it is. Dropped *after* the write, the way
      // retouchPhoto handles a replaced image: doing it first and then failing the
      // update leaves the row naming a poster that no longer exists, and /motion
      // renders the gap.
      const stored = await db.video.findUnique({
        where: { id },
        select: { posterImageUrl: true, spriteUrl: true, rollId: true },
      });
      const replaced = [
        stored?.posterImageUrl !== data.posterImageUrl ? stored?.posterImageUrl : null,
        stored?.spriteUrl !== data.spriteUrl ? stored?.spriteUrl : null,
      ].filter((url): url is string => Boolean(url));

      // A clip moved to another roll goes to its end: its old sortOrder means
      // nothing among the new roll's clips.
      const moved = stored?.rollId !== data.rollId ? await nextSortOrder(data.rollId) : null;

      // Replace the tag set wholesale rather than diffing it — but as one
      // transaction, because the two halves are not independently useful: a delete
      // that commits while the update fails leaves the clip with no tags at all,
      // silently, and the admin has no way to tell that happened.
      await db.$transaction([
        db.videoTag.deleteMany({ where: { videoId: id } }),
        db.video.update({
          where: { id },
          data: {
            ...data,
            ...(moved === null ? {} : { sortOrder: moved }),
            tags: { create: connections },
          },
        }),
      ]);

      if (replaced.length) {
        try {
          await deleteObjectsByUrl(replaced);
        } catch (cause) {
          // The save landed; one orphaned poster or strip is not worth reporting
          // as a failed edit.
          console.error('Could not remove the replaced preview files for video', id, replaced, cause);
        }
      }
    } else {
      // New clips land at the end of their roll. Sort order is never typed in — it
      // is rearranged by dragging rows in the admin list.
      const created = await db.video.create({
        data: {
          ...data,
          sortOrder: await nextSortOrder(data.rollId),
          tags: { create: connections },
        },
      });
      await announce('motion', created.id);
    }

    // An edit that drops the last clip carrying a tag leaves it behind.
    await pruneUnusedTags();

    revalidatePath('/admin/videos');
    // 'layout' rather than the default, so the clip pages under /motion go too.
    // Every one of them carries its own position on the roll — the frame code and
    // the prev/next pager — so a change to any clip can invalidate all of them,
    // and a reorder always does.
    revalidatePath(MOTION_LAYOUT, 'layout');
    revalidatePath('/');
    return {};
  });
}

/**
 * The Motion inspector's autosave: every field a person types, none of the
 * stored media. Kept apart from saveVideo for the reason savePhotoDetails is —
 * a stale copy of the poster and sprite URLs riding along with a retitle would
 * undo a thumbnail picked a moment earlier from the same inspector.
 */
export async function saveVideoDetails(input: VideoDetailsInput): Promise<{ error?: string }> {
  return attempt('saveVideoDetails', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = detailsSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { id, tags, youtubeUrl: youtubeId, ...fields } = parsed.data;
    const [roll, stored] = await Promise.all([
      db.roll.findUnique({ where: { id: fields.rollId }, select: { id: true } }),
      db.video.findUnique({ where: { id }, select: { rollId: true } }),
    ]);
    if (!stored) return { error: 'That clip no longer exists' };
    if (!roll) return { error: 'That roll no longer exists — pick another' };

    // Same end-of-the-roll rule as saveVideo for a clip filed somewhere new.
    const moved = stored.rollId !== fields.rollId ? await nextSortOrder(fields.rollId) : null;
    const connections = await tagConnections(tags);
    await db.$transaction([
      db.videoTag.deleteMany({ where: { videoId: id } }),
      db.video.update({
        where: { id },
        data: {
          ...fields,
          youtubeId,
          ...(moved === null ? {} : { sortOrder: moved }),
          tags: { create: connections },
        },
      }),
    ]);
    await pruneUnusedTags();

    revalidateMotion();
    return {};
  });
}

/**
 * Points a clip at a new thumbnail the browser has already uploaded — a frame
 * cut from its own scrub strip. Whatever it showed before, grabbed frame or
 * hand-picked cover, is unreachable once the row moves on, so it goes after
 * the write, as in saveVideo.
 */
export async function setVideoPoster(id: string, posterImageUrl: string): Promise<{ error?: string }> {
  return attempt('setVideoPoster', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = z.object({ id: z.string().min(1), posterImageUrl: z.url() }).safeParse({ id, posterImageUrl });
    if (!parsed.success) return { error: 'Invalid thumbnail' };

    const stored = await db.video.findUnique({ where: { id }, select: { posterImageUrl: true } });
    if (!stored) return { error: 'That clip no longer exists' };

    await db.video.update({ where: { id }, data: { posterImageUrl: parsed.data.posterImageUrl } });
    if (stored.posterImageUrl && stored.posterImageUrl !== parsed.data.posterImageUrl) {
      try {
        await deleteObjectsByUrl([stored.posterImageUrl]);
      } catch (cause) {
        console.error('Could not remove the replaced poster for video', id, stored.posterImageUrl, cause);
      }
    }

    revalidateMotion();
    return {};
  });
}

/**
 * What every clip edit invalidates. 'layout' rather than the default for
 * /motion, so the clip pages under it go too: each carries its own position on
 * the roll — the frame code and the prev/next pager — so a change to any clip
 * can invalidate all of them. Not exported: every export here is an endpoint.
 */
function revalidateMotion() {
  revalidatePath('/admin', 'layout');
  revalidatePath(MOTION_LAYOUT, 'layout');
  revalidatePath('/');
}

/**
 * Persists one roll's order after a drag — along the roll, or into it from
 * another. Takes the roll's full ordering rather than a moved pair, so the
 * result cannot drift from what the admin sees on screen, and writes rollId with
 * each position so a clip dragged in from elsewhere is moved by the same write.
 * The roll it left needs nothing: its remaining clips keep their relative order,
 * and a gap in sortOrder is harmless.
 */
export async function reorderVideos(rollId: string, ids: string[]): Promise<{ error?: string }> {
  // The sharpest case for the wrapper: this takes whatever ids the list on
  // screen holds, so a drag against a row deleted in another tab throws P2025
  // out of the transaction and the reorder silently does nothing.
  return attempt('reorderVideos', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = z
      .object({ rollId: z.string().min(1), ids: z.array(z.string().min(1)) })
      .safeParse({ rollId, ids });
    if (!parsed.success) return { error: 'Invalid ordering' };

    const roll = await db.roll.findUnique({ where: { id: parsed.data.rollId }, select: { id: true } });
    if (!roll) return { error: 'That roll no longer exists' };

    await db.$transaction(
      parsed.data.ids.map((id, index) =>
        db.video.update({ where: { id }, data: { rollId: roll.id, sortOrder: index } }),
      ),
    );

    revalidatePath('/admin/videos');
    // 'layout' rather than the default, so the clip pages under /motion go too.
    // Every one of them carries its own position on the roll — the frame code and
    // the prev/next pager — so a change to any clip can invalidate all of them,
    // and a reorder always does.
    revalidatePath(MOTION_LAYOUT, 'layout');
    revalidatePath('/');
    return {};
  });
}

export async function deleteVideo(id: string): Promise<{ error?: string }> {
  return attempt('deleteVideo', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const video = await db.video.findUnique({
      where: { id },
      select: { videoUrl: true, posterImageUrl: true, spriteUrl: true },
    });
    if (!video) return { error: 'That video no longer exists' };

    // The row first, then the objects — see deletePhoto for the reasoning. A clip
    // owns three objects, so an orphan here costs more than a stray photo does,
    // which is an argument for sweeping the log, not for leaving /motion pointing
    // at a clip that will not play.
    const objects = [video.videoUrl, video.posterImageUrl, video.spriteUrl];
    await db.video.delete({ where: { id } });
    await forgetEngagement('motion', id);

    try {
      await deleteObjectsByUrl(objects);
    } catch (cause) {
      console.error('R2 cleanup failed for deleted video', id, objects, cause);
    }

    await pruneUnusedTags();

    revalidatePath('/admin/videos');
    // 'layout' rather than the default, so the clip pages under /motion go too.
    // Every one of them carries its own position on the roll — the frame code and
    // the prev/next pager — so a change to any clip can invalidate all of them,
    // and a reorder always does.
    revalidatePath(MOTION_LAYOUT, 'layout');
    revalidatePath('/');
    // A clip block in a journal post refers to it by id; rebuilt, the post leaves
    // it out rather than showing a player for a file that is gone.
    revalidatePath(JOURNAL_LAYOUT, 'layout');
    return {};
  });
}

const rollSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'A roll needs a name'),
  description: z.string().trim(),
});

export type RollInput = z.infer<typeof rollSchema>;

export async function saveRoll(input: RollInput): Promise<{ error?: string }> {
  return attempt('saveRoll', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = rollSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { id, ...data } = parsed.data;
    if (id) {
      await db.roll.update({ where: { id }, data });
    } else {
      // Same end-of-the-list rule as a new clip.
      const last = await db.roll.findFirst({
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      await db.roll.create({ data: { ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    }

    revalidatePath('/admin/videos');
    // A roll's name is printed on every clip page in it.
    revalidatePath(MOTION_LAYOUT, 'layout');
    revalidatePath('/');
    return {};
  });
}

/** The roll counterpart to reorderVideos, with the same whole-ordering contract. */
export async function reorderRolls(ids: string[]): Promise<{ error?: string }> {
  return attempt('reorderRolls', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = z.array(z.string().min(1)).safeParse(ids);
    if (!parsed.success) return { error: 'Invalid ordering' };

    await db.$transaction(
      parsed.data.map((id, index) =>
        db.roll.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    revalidatePath('/admin/videos');
    // Reordering rolls re-letters them, which changes every clip's frame code.
    revalidatePath(MOTION_LAYOUT, 'layout');
    revalidatePath('/');
    return {};
  });
}

export async function deleteRoll(id: string): Promise<{ error?: string }> {
  return attempt('deleteRoll', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    // Checked up front for the message; the Restrict on Video.roll is what
    // actually guarantees a roll never takes its clips with it.
    const clips = await db.video.count({ where: { rollId: id } });
    if (clips > 0) {
      return {
        error: `Move its ${clips} ${clips === 1 ? 'clip' : 'clips'} to another roll first`,
      };
    }

    await db.roll.delete({ where: { id } });

    revalidatePath('/admin/videos');
    revalidatePath(MOTION_LAYOUT, 'layout');
    revalidatePath('/');
    return {};
  });
}
