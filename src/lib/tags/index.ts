import { db } from '@/lib/db';
import { parseTagNames } from './parse';

/**
 * Tags are created inline as they are typed — there is no manage-tags screen.
 * Both the photo and video actions need this, so it lives here and is imported.
 * Never copy the upsert into an actions file.
 */

export { parseTagNames, formatTagNames } from './parse';

/** Upserts each named tag and returns join-table rows ready to `create`. */
export async function tagConnections(tagsRaw: string): Promise<{ tagId: string }[]> {
  const names = parseTagNames(tagsRaw);
  const tags = await Promise.all(
    names.map((name) => db.tag.upsert({ where: { name }, create: { name }, update: {} })),
  );
  return tags.map((tag) => ({ tagId: tag.id }));
}

/**
 * Drops tags nothing points at any more.
 *
 * The join rows go on their own — cascaded by a delete, wiped wholesale by a
 * save — but the Tag row they named survives, so a tag typed once and then
 * removed used to linger forever. Invisible until the forms started offering
 * every tag as a pill; now it is the difference between the suggestions being
 * the vocabulary in use and a list of everything ever typed.
 *
 * Called after any write that can strand one. Nothing depends on its result, so
 * it is cheap to over-call and harmless when there is nothing to remove.
 */
export async function pruneUnusedTags(): Promise<void> {
  await db.tag.deleteMany({ where: { photos: { none: {} }, videos: { none: {} } } });
}

/**
 * Every tag ever used, photos and videos alike — the admin forms offer these as
 * pills so a tag gets typed out once and clicked thereafter.
 */
export async function listTagNames(): Promise<string[]> {
  const tags = await db.tag.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
  return tags.map((tag) => tag.name);
}
