'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { pruneUnusedTags, tagConnections } from '@/lib/tags';
import { deleteObjectsByUrl } from '@/lib/storage/r2';

const videoSchema = z.object({
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
  tags: z.string(),
})
  // A *new* clip has just had its frames grabbed in the browser, which cannot
  // succeed without dimensions — so a 0 arriving on a create is a real fault
  // worth refusing, where a 0 arriving on an edit is only history.
  .refine((input) => Boolean(input.id) || (input.width > 0 && input.height > 0), {
    message: 'The clip dimensions could not be read',
    path: ['width'],
  });

export type VideoInput = z.infer<typeof videoSchema>;

export async function saveVideo(input: VideoInput): Promise<{ error?: string }> {
  // Server actions are publicly reachable endpoints — re-check auth here rather
  // than trusting that the proxy gate covered the page that rendered the form.
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const parsed = videoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, tags, ...data } = parsed.data;
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
      select: { posterImageUrl: true, spriteUrl: true },
    });
    const replaced = [
      stored?.posterImageUrl !== data.posterImageUrl ? stored?.posterImageUrl : null,
      stored?.spriteUrl !== data.spriteUrl ? stored?.spriteUrl : null,
    ].filter((url): url is string => Boolean(url));

    // Replace the tag set wholesale rather than diffing it — but as one
    // transaction, because the two halves are not independently useful: a delete
    // that commits while the update fails leaves the clip with no tags at all,
    // silently, and the admin has no way to tell that happened.
    await db.$transaction([
      db.videoTag.deleteMany({ where: { videoId: id } }),
      db.video.update({
        where: { id },
        data: { ...data, tags: { create: connections } },
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
    // New clips land at the end of the wall. Sort order is never typed in — it is
    // rearranged by dragging rows in the admin list.
    const last = await db.video.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    await db.video.create({
      data: {
        ...data,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        tags: { create: connections },
      },
    });
  }

  // An edit that drops the last clip carrying a tag leaves it behind.
  await pruneUnusedTags();

  revalidatePath('/admin/videos');
  // 'layout' rather than the default, so the clip pages under /motion go too.
  // Every one of them carries its own position on the roll — the frame code and
  // the prev/next pager — so a change to any clip can invalidate all of them,
  // and a reorder always does.
  revalidatePath('/motion', 'layout');
  return {};
}

/**
 * Persists a drag-reordered list. Takes the full ordering rather than a moved
 * pair, so the result cannot drift from what the admin sees on screen, and
 * writes it in one transaction so a partial failure cannot leave gaps.
 */
export async function reorderVideos(ids: string[]): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const parsed = z.array(z.string().min(1)).safeParse(ids);
  if (!parsed.success) return { error: 'Invalid ordering' };

  await db.$transaction(
    parsed.data.map((id, index) =>
      db.video.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  revalidatePath('/admin/videos');
  // 'layout' rather than the default, so the clip pages under /motion go too.
  // Every one of them carries its own position on the roll — the frame code and
  // the prev/next pager — so a change to any clip can invalidate all of them,
  // and a reorder always does.
  revalidatePath('/motion', 'layout');
  return {};
}

export async function deleteVideo(id: string): Promise<{ error?: string }> {
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
  revalidatePath('/motion', 'layout');
  return {};
}
