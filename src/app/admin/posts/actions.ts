'use server';

import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { storageEnv } from '@/lib/env';
import { isAuthenticated } from '@/lib/auth/guard';
import { slugify } from '@/lib/slug';
import { attempt, attemptOr } from '@/lib/actions/errors';
import { announce } from '@/lib/newsletter/queue';
import { postContentSchema } from '@/lib/post/content';
import { missingForPublish } from '@/lib/post/form';
import { isPostCategory } from '@/lib/post/trip';
import { deleteObjectsByUrl, objectKeyFromUrl } from '@/lib/storage/r2';

/** What a post is called until it has a title, for its draft slug. */
const UNTITLED = 'Untitled';

/**
 * The slug for a title, suffixed until it is free. The post's own slug does not
 * count as a collision, so re-saving an unchanged draft keeps its slug rather
 * than walking to -2, -3, -4.
 */
async function uniqueSlug(title: string, currentId?: string): Promise<string> {
  const base = slugify(title || UNTITLED);
  let candidate = base;
  let suffix = 2;

  for (;;) {
    const existing = await db.blogPost.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === currentId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

/** Every public page a post appears on, rebuilt after anything about it changes. */
function revalidatePost(slug: string, previousSlug?: string) {
  revalidatePath('/admin/posts');
  revalidatePath('/journal');
  revalidatePath('/');
  revalidatePath(`/journal/${slug}`);
  if (previousSlug && previousSlug !== slug) revalidatePath(`/journal/${previousSlug}`);
}

/**
 * Starts a post as an empty draft and returns its id, so the editor always works
 * on a row that exists. That is what lets photos be uploaded into a post before
 * its first save: a JournalPhoto needs a post to belong to.
 */
export async function createPost(): Promise<{ id?: string; error?: string }> {
  return attempt('createPost', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const post = await db.blogPost.create({
      data: {
        title: '',
        slug: await uniqueSlug(UNTITLED),
        content: { version: 1, blocks: [] },
        draft: true,
      },
      select: { id: true },
    });
    revalidatePath('/admin/posts');
    return { id: post.id };
  });
}

const saveSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim(),
  content: postContentSchema,
  draft: z.boolean(),
});

export type SavePostInput = z.input<typeof saveSchema>;

export async function savePost(input: SavePostInput): Promise<{ error?: string; slug?: string }> {
  // Wrapped so a failure past validation still arrives as `{ error }` rather
  // than as a rejected promise the editor cannot see — see lib/actions/errors.
  return attempt('savePost', async () => {
    // Server actions are publicly reachable endpoints — re-check auth here rather
    // than trusting that the proxy gate covered the page that rendered the editor.
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) {
      return { error: `That post could not be saved: ${parsed.error.issues[0].message}` };
    }
    const { id, title, content, draft } = parsed.data;

    // A draft can be saved in any state — half a title, no words yet. Only going
    // public needs a title and something to read.
    if (!draft) {
      const missing = missingForPublish({ title, content });
      if (missing.length) return { error: `Publishing needs ${missing.join(' and ')}.` };
    }

    const existing = await db.blogPost.findUnique({
      where: { id },
      select: { slug: true, draft: true },
    });
    if (!existing) return { error: 'That post no longer exists' };

    // A published slug is a public URL that may already be linked to, so retitling
    // must not move it. Drafts are not public yet, so their slug still tracks the
    // title.
    const slug = existing.draft ? await uniqueSlug(title, id) : existing.slug;

    // Publishing is what dates a post. Without this, something drafted weeks ago
    // would appear in the journal already buried under newer entries.
    const publishing = existing.draft && !draft;

    await db.blogPost.update({
      where: { id },
      data: {
        title,
        // Validated above; the cast is only because Prisma's JSON input type has
        // no way to accept a typed object with optional fields.
        content: content as unknown as Prisma.InputJsonValue,
        draft,
        slug,
        ...(publishing ? { publishedAt: new Date() } : {}),
      },
    });
    // Unpublishing and republishing calls this again; announce() ignores an
    // item it has already queued, so subscribers hear about a post only once.
    if (publishing) await announce('journal', id);

    revalidatePost(slug, existing.slug);
    return { slug };
  });
}

export interface PostMediaLibrary {
  photos: {
    id: string;
    imageUrl: string;
    width: number;
    height: number;
    title: string;
    location: string;
  }[];
  videos: {
    id: string;
    videoUrl: string;
    posterImageUrl: string;
    width: number;
    height: number;
    title: string;
  }[];
}

/**
 * What the editor offers from the existing library — stills off the wall for a
 * photos block, clips off the reel for a clip block — so a post can reuse them
 * rather than upload a second copy. Fetched when first asked for rather than with
 * the page: most edits never touch it, and it is every row in both tables.
 */
export async function listPostMedia(): Promise<PostMediaLibrary> {
  // No `{ error }` to return here, so the failure shape is the one this already
  // uses for an unauthenticated caller: an empty library. A picker that opens
  // with nothing in it is recoverable; a rejected promise takes the editor down.
  return attemptOr('listPostMedia', { photos: [], videos: [] }, async () => {
    if (!(await isAuthenticated())) return { photos: [], videos: [] };

    const [photos, videos] = await Promise.all([
      db.photo.findMany({
        select: { id: true, imageUrl: true, width: true, height: true, title: true, location: true },
        orderBy: { createdAt: 'desc' },
      }),
      db.video.findMany({
        select: { id: true, videoUrl: true, posterImageUrl: true, width: true, height: true, title: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    return { photos, videos };
  });
}

// ── Trip photos ──────────────────────────────────────────────────────────────

export interface JournalPhotoRow {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  takenAt: Date | null;
  category: string | null;
}

const JOURNAL_PHOTO_SELECT = {
  id: true,
  imageUrl: true,
  width: true,
  height: true,
  takenAt: true,
  category: true,
} as const;

const addPhotoSchema = z.object({
  postId: z.string().min(1),
  imageUrl: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // ISO string, already wall-clock-as-UTC (lib/post/trip.ts), or null.
  takenAt: z.iso.datetime().nullable(),
});

/**
 * Records a photo the editor has just uploaded into a post. The upload itself
 * went browser → R2 (lib/storage/upload-client.ts); this only writes the row.
 * The URL must be an object under journal/ in our own bucket — the upload route
 * minted that key, and nothing else is a post's own photo.
 */
export async function addJournalPhoto(
  input: z.input<typeof addPhotoSchema>,
): Promise<{ photo?: JournalPhotoRow; error?: string }> {
  return attempt('addJournalPhoto', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = addPhotoSchema.safeParse(input);
    if (!parsed.success) return { error: 'That upload could not be recorded' };
    const { postId, imageUrl, width, height, takenAt } = parsed.data;

    const key = objectKeyFromUrl(imageUrl, storageEnv().R2_PUBLIC_BASE_URL);
    if (!key?.startsWith('journal/')) return { error: 'That image is not a journal upload' };

    const post = await db.blogPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return { error: 'That post no longer exists' };

    const photo = await db.journalPhoto.create({
      data: { postId, imageUrl, width, height, takenAt: takenAt ? new Date(takenAt) : null },
      select: JOURNAL_PHOTO_SELECT,
    });
    return { photo };
  });
}

const tagSchema = z.object({
  postId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
  category: z.string().nullable().refine((value) => value === null || isPostCategory(value), 'Unknown category'),
});

/** Files a set of a post's trip photos under one category, or clears it with null. */
export async function tagJournalPhotos(input: z.input<typeof tagSchema>): Promise<{ error?: string }> {
  return attempt('tagJournalPhotos', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = tagSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { postId, ids, category } = parsed.data;

    // Scoped to the post, so an id from some other post's tray is left alone.
    await db.journalPhoto.updateMany({ where: { postId, id: { in: ids } }, data: { category } });
    return {};
  });
}

const deletePhotosSchema = z.object({
  postId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
});

/**
 * Deletes trip photos from a post: rows first, then their objects — the order
 * deletePhoto uses, and for its reason. A half-done delete then leaves an
 * object nothing points at, not a published post showing a 404.
 *
 * The blocks that pointed at them are the editor's to tidy (it drops the
 * references from its state); until the post is next saved, the published page
 * simply skips a photo it can no longer resolve.
 */
export async function deleteJournalPhotos(
  input: z.input<typeof deletePhotosSchema>,
): Promise<{ error?: string }> {
  return attempt('deleteJournalPhotos', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = deletePhotosSchema.safeParse(input);
    if (!parsed.success) return { error: 'Nothing to delete' };
    const { postId, ids } = parsed.data;

    const [post, photos] = await Promise.all([
      db.blogPost.findUnique({ where: { id: postId }, select: { slug: true, draft: true } }),
      db.journalPhoto.findMany({ where: { postId, id: { in: ids } }, select: { imageUrl: true } }),
    ]);
    if (!post) return { error: 'That post no longer exists' };

    await db.journalPhoto.deleteMany({ where: { postId, id: { in: ids } } });

    try {
      await deleteObjectsByUrl(photos.map((photo) => photo.imageUrl));
    } catch (cause) {
      console.error('R2 cleanup failed for deleted journal photos', postId, cause);
    }

    if (!post.draft) revalidatePost(post.slug);
    return {};
  });
}

export async function deletePost(id: string): Promise<{ error?: string }> {
  return attempt('deletePost', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const post = await db.blogPost.findUnique({
      where: { id },
      select: { slug: true, photos: { select: { imageUrl: true } } },
    });
    if (!post) return { error: 'That post no longer exists' };

    // The cascade drops the trip photos' rows with the post; their objects are
    // this action's to remove, after the rows, for the reason given above.
    await db.blogPost.delete({ where: { id } });

    if (post.photos.length) {
      try {
        await deleteObjectsByUrl(post.photos.map((photo) => photo.imageUrl));
      } catch (cause) {
        console.error('R2 cleanup failed for deleted post', id, cause);
      }
    }

    revalidatePost(post.slug);
    return {};
  });
}
