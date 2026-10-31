import { db } from '@/lib/db';
import { legacyMediaUrls, markdownToContent, resolveLegacyMedia } from '@/lib/markdown/legacy';
import { parseContent, type Block, type PostContent } from './content';
import { referencedMedia, type PostMedia } from './media';

/**
 * Reads a post's body for rendering or editing: its blocks — converted from the
 * Markdown column if it has never been saved as blocks — and every photo and
 * clip they point at, in one query per table.
 */
export async function loadPostBody(post: {
  id: string;
  content: unknown;
  markdownContent: string;
}): Promise<{ content: PostContent; media: PostMedia }> {
  const content = parseContent(post.content) ?? (await convertLegacy(post.markdownContent));
  return { content, media: await loadPostMedia(post.id, content.blocks) };
}

async function convertLegacy(markdown: string): Promise<PostContent> {
  const converted = markdownToContent(markdown);
  const urls = legacyMediaUrls(converted);

  const [stills, clips] = await Promise.all([
    urls.images.length
      ? db.photo.findMany({ where: { imageUrl: { in: urls.images } }, select: { id: true, imageUrl: true } })
      : [],
    urls.videos.length
      ? db.video.findMany({ where: { videoUrl: { in: urls.videos } }, select: { id: true, videoUrl: true } })
      : [],
  ]);

  return resolveLegacyMedia(
    converted,
    new Map(stills.map((photo) => [photo.imageUrl, photo.id])),
    new Map(clips.map((clip) => [clip.videoUrl, clip.id])),
  );
}

/**
 * The rows a post's blocks reference. Journal photos are matched on the post as
 * well as the id, so a block can only ever show photos uploaded into its own
 * post — an id copied from another post's body resolves to nothing.
 */
export async function loadPostMedia(postId: string, blocks: Block[]): Promise<PostMedia> {
  const ids = referencedMedia(blocks);

  const [journal, stills, clips] = await Promise.all([
    ids.journal.length
      ? db.journalPhoto.findMany({
          where: { postId, id: { in: ids.journal } },
          select: { id: true, imageUrl: true, width: true, height: true },
        })
      : [],
    ids.stills.length
      ? db.photo.findMany({
          where: { id: { in: ids.stills }, draft: false },
          select: { id: true, imageUrl: true, width: true, height: true, title: true, location: true },
        })
      : [],
    ids.clips.length
      ? db.video.findMany({
          where: { id: { in: ids.clips }, draft: false },
          select: { id: true, videoUrl: true, posterImageUrl: true, width: true, height: true, title: true },
        })
      : [],
  ]);

  return {
    journal: Object.fromEntries(
      journal.map((photo) => [photo.id, { url: photo.imageUrl, width: photo.width, height: photo.height, alt: '' }]),
    ),
    stills: Object.fromEntries(
      stills.map((photo) => [
        photo.id,
        { url: photo.imageUrl, width: photo.width, height: photo.height, alt: photo.title || photo.location },
      ]),
    ),
    clips: Object.fromEntries(clips.map((clip) => [clip.id, clip])),
  };
}
