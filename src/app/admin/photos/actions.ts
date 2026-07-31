'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { tagConnections } from '@/lib/tags';
import { photoSettingsSchema } from '@/lib/photo/settings';

const photoSchema = z.object({
  id: z.string().optional(),
  imageUrl: z.url('Upload an image before saving'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Trimmed before the length check: a lone space would otherwise satisfy min(1)
  // and store a blank-looking value.
  location: z.string().trim().min(1, 'Location is required'),
  camera: z.string().trim().min(1, 'Camera is required'),
  // Every settings field is optional — a phone snap or a stripped export may
  // carry no EXIF at all, and none of it is worth blocking a save over.
  settings: photoSettingsSchema,
  avgHue: z.number(),
  avgLightness: z.number(),
  isMonochrome: z.boolean(),
  tags: z.string(),
});

export type PhotoInput = z.infer<typeof photoSchema>;

export async function savePhoto(input: PhotoInput): Promise<{ error?: string }> {
  // Server actions are publicly reachable endpoints — re-check auth here rather
  // than trusting that the proxy gate covered the page that rendered the form.
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, tags, ...data } = parsed.data;
  const connections = await tagConnections(tags);

  if (id) {
    // Replace the tag set wholesale rather than diffing it.
    await db.photoTag.deleteMany({ where: { photoId: id } });
    await db.photo.update({
      where: { id },
      data: { ...data, tags: { create: connections } },
    });
  } else {
    await db.photo.create({ data: { ...data, tags: { create: connections } } });
  }

  revalidatePath('/admin/photos');
  revalidatePath('/stills');
  return {};
}

export async function deletePhoto(id: string): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  await db.photo.delete({ where: { id } });

  revalidatePath('/admin/photos');
  revalidatePath('/stills');
  return {};
}
