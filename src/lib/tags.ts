import { db } from '@/lib/db';

/**
 * Tags are created inline as they are typed — there is no manage-tags screen.
 * Both the photo and video actions need this, so it lives here and is imported.
 * Never copy the upsert into an actions file.
 */

export function parseTagNames(input: string): string[] {
  const names = input
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}

/** Upserts each named tag and returns join-table rows ready to `create`. */
export async function tagConnections(tagsRaw: string): Promise<{ tagId: string }[]> {
  const names = parseTagNames(tagsRaw);
  const tags = await Promise.all(
    names.map((name) => db.tag.upsert({ where: { name }, create: { name }, update: {} })),
  );
  return tags.map((tag) => ({ tagId: tag.id }));
}
