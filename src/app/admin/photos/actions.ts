'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { tagConnections } from '@/lib/tags';
import { photoSettingsSchema } from '@/lib/photo/settings';
import { deleteObjectsByUrl } from '@/lib/storage/r2';

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

const retouchSchema = z.object({
  id: z.string().min(1),
  imageUrl: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  avgHue: z.number(),
  avgLightness: z.number(),
  isMonochrome: z.boolean(),
});

export type RetouchInput = z.infer<typeof retouchSchema>;

/**
 * Points a photo at a newly uploaded file — the border-trimmed version — and
 * replaces the colour stats along with it, since those were derived from an
 * image that still had its frame.
 *
 * The previous object is removed only after the row is updated. That is the
 * opposite order from deletePhoto, and deliberately so: here the row is what
 * makes the old file unreachable, and deleting first would leave a live row
 * pointing at a 404 if the update then failed.
 */
export async function retouchPhoto(input: RetouchInput): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const parsed = retouchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, ...data } = parsed.data;
  const existing = await db.photo.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!existing) return { error: 'That photo no longer exists' };

  await db.photo.update({ where: { id }, data });

  if (existing.imageUrl !== data.imageUrl) {
    try {
      await deleteObjectsByUrl([existing.imageUrl]);
    } catch (cause) {
      // The trim itself succeeded, so this is not worth failing the action over —
      // the cost is one orphaned object, and saying so beats a false error.
      console.error('Could not remove the pre-trim image for photo', id, cause);
    }
  }

  revalidatePath('/admin/photos');
  revalidatePath(`/admin/photos/${id}`);
  revalidatePath('/stills');
  return {};
}

export async function deletePhoto(id: string): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const photo = await db.photo.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!photo) return { error: 'That photo no longer exists' };

  // R2 first, then the row. Deleting an object that is already gone is not an
  // error, so this is safe to retry; doing it in the other order would leave the
  // file behind for good the moment the row that names it disappears.
  try {
    await deleteObjectsByUrl([photo.imageUrl]);
  } catch (cause) {
    console.error('R2 cleanup failed for photo', id, cause);
    return { error: 'Could not remove the image from storage — nothing was deleted' };
  }

  await db.photo.delete({ where: { id } });

  revalidatePath('/admin/photos');
  revalidatePath('/stills');
  return {};
}
