'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { tagConnections } from '@/lib/tags';

const videoSchema = z.object({
  id: z.string().optional(),
  videoUrl: z.url('Upload a video before saving'),
  posterImageUrl: z.url('The poster image failed to generate'),
  spriteUrl: z.url('The preview sprite failed to generate'),
  spriteFrames: z.number().int().positive(),
  // Trimmed before the length check, so a lone space cannot pass as a value.
  title: z.string().trim().min(1, 'Title is required'),
  rollGroup: z.string().trim().min(1, 'Roll is required'),
  sortOrder: z.number().int(),
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
    await db.video.create({ data: { ...data, tags: { create: connections } } });
  }

  revalidatePath('/admin/videos');
  revalidatePath('/motion');
  return {};
}

export async function deleteVideo(id: string): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  await db.video.delete({ where: { id } });

  revalidatePath('/admin/videos');
  revalidatePath('/motion');
  return {};
}
