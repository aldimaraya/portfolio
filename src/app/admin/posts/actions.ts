'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { slugify } from '@/lib/slug';

const postSchema = z.object({
  id: z.string().optional(),
  // Trimmed before the length check, so a lone space cannot pass as a value.
  title: z.string().trim().min(1, 'Title is required'),
  markdownContent: z.string().trim().min(1, 'Write something before saving'),
  draft: z.boolean(),
});

export type PostInput = z.infer<typeof postSchema>;

/**
 * The slug for a title, suffixed until it is free. The post's own slug does not
 * count as a collision, so re-saving an unchanged draft keeps its slug rather
 * than walking to -2, -3, -4.
 */
async function uniqueSlug(title: string, currentId?: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;

  for (;;) {
    const existing = await db.blogPost.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === currentId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function savePost(input: PostInput): Promise<{ error?: string }> {
  // Server actions are publicly reachable endpoints — re-check auth here rather
  // than trusting that the proxy gate covered the page that rendered the form.
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, ...data } = parsed.data;

  if (!id) {
    await db.blogPost.create({
      data: { ...data, slug: await uniqueSlug(data.title) },
    });
    revalidatePath('/admin/posts');
    revalidatePath('/journal');
    return {};
  }

  const existing = await db.blogPost.findUnique({
    where: { id },
    select: { slug: true, draft: true },
  });
  if (!existing) return { error: 'That post no longer exists' };

  // A published slug is a public URL that may already be linked to, so retitling
  // must not move it. Drafts are not public yet, so their slug still tracks the
  // title.
  const slug = existing.draft ? await uniqueSlug(data.title, id) : existing.slug;

  // Publishing is what dates a post. Without this, something drafted weeks ago
  // would appear in the journal already buried under newer entries.
  const publishing = existing.draft && !data.draft;

  await db.blogPost.update({
    where: { id },
    data: { ...data, slug, ...(publishing ? { publishedAt: new Date() } : {}) },
  });

  revalidatePath('/admin/posts');
  revalidatePath('/journal');
  revalidatePath(`/journal/${slug}`);
  if (slug !== existing.slug) revalidatePath(`/journal/${existing.slug}`);
  return {};
}

export async function deletePost(id: string): Promise<{ error?: string }> {
  if (!(await isAuthenticated())) return { error: 'Unauthorized' };

  const post = await db.blogPost.findUnique({ where: { id }, select: { slug: true } });
  if (!post) return { error: 'That post no longer exists' };

  await db.blogPost.delete({ where: { id } });

  revalidatePath('/admin/posts');
  revalidatePath('/journal');
  revalidatePath(`/journal/${post.slug}`);
  return {};
}
