'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth/guard';
import { attempt } from '@/lib/actions/errors';
import { linkSchema, type LinkInput } from '@/lib/links/link';

/**
 * Every public page draws the links — in the header and the footer — so any
 * change to them invalidates all of them. 'layout' on the root is the one call
 * that reaches the whole (site) group, clip pages and journal posts included.
 */
function revalidateLinks() {
  revalidatePath('/', 'layout');
}

export async function saveLink(input: LinkInput): Promise<{ error?: string }> {
  return attempt('saveLink', async () => {
    // Server actions are publicly reachable endpoints — re-check auth here rather
    // than trusting that the proxy gate covered the page that rendered the form.
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = linkSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { id, ...data } = parsed.data;
    if (id) {
      await db.siteLink.update({ where: { id }, data });
    } else {
      // New links go to the end, as a new roll does.
      const last = await db.siteLink.findFirst({
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      await db.siteLink.create({ data: { ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    }

    revalidateLinks();
    return {};
  });
}

/** Takes the whole ordering, like reorderRolls, so it cannot drift from the screen. */
export async function reorderLinks(ids: string[]): Promise<{ error?: string }> {
  return attempt('reorderLinks', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    const parsed = z.array(z.string().min(1)).safeParse(ids);
    if (!parsed.success) return { error: 'Invalid ordering' };

    await db.$transaction(
      parsed.data.map((id, index) =>
        db.siteLink.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    revalidateLinks();
    return {};
  });
}

export async function deleteLink(id: string): Promise<{ error?: string }> {
  return attempt('deleteLink', async () => {
    if (!(await isAuthenticated())) return { error: 'Unauthorized' };

    await db.siteLink.delete({ where: { id } });

    revalidateLinks();
    return {};
  });
}
