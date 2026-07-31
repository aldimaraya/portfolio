'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { tagConnections } from '@/lib/tags';
import { deleteObjectsByUrl } from '@/lib/storage/r2';

const videoSchema = z.object({
  id: z.string().optional(),
  videoUrl: z.url('Upload a video before saving'),
  posterImageUrl: z.url('The poster image failed to generate'),
  spriteUrl: z.url('The preview sprite failed to generate'),
  spriteFrames: z.number().int().positive(),
  // Trimmed before the length check, so a lone space cannot pass as a value.
  title: z.string().trim().min(1, 'Title is required'),
  // Optional — not every clip needs a blurb.
  description: z.string().trim(),
  tags: z.string(),
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
    // Replace the tag set wholesale rather than diffing it.
    await db.videoTag.deleteMany({ where: { videoId: id } });
    await db.video.update({
      where: { id },
      data: { ...data, tags: { create: connections } },
    });
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

  revalidatePath('/admin/videos');
  revalidatePath('/motion');
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
  revalidatePath('/motion');
  return {};
}

export async function deleteVideo(id: string): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const video = await db.video.findUnique({
    where: { id },
    select: { videoUrl: true, posterImageUrl: true, spriteUrl: true },
  });
  if (!video) return { error: 'That video no longer exists' };

  // A clip owns three objects, so leaving these behind costs considerably more
  // than a stray photo. R2 first for the same reason as deletePhoto.
  try {
    await deleteObjectsByUrl([video.videoUrl, video.posterImageUrl, video.spriteUrl]);
  } catch (cause) {
    console.error('R2 cleanup failed for video', id, cause);
    return { error: 'Could not remove the files from storage — nothing was deleted' };
  }

  await db.video.delete({ where: { id } });

  revalidatePath('/admin/videos');
  revalidatePath('/motion');
  return {};
}
