import { db } from '@/lib/db';
import { listTagNames } from '@/lib/tags';
import { safeNextPath } from '@/lib/auth/next-path';
import { RETURN_PARAM } from '@/lib/photo/lightbox-link';
import { youtubeWatchUrl } from '@/lib/markdown/media';
import { CLIP_PARAM } from '@/lib/video/edit-link';
import { MotionLibrary, type Clip, type ClipGroup } from '@/components/admin/motion/MotionLibrary';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AdminVideosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const [rolls, videos, tagOptions] = await Promise.all([
    db.roll.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    // Drafts wait on Add media until they are published.
    db.video.findMany({
      where: { draft: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { tags: { include: { tag: true } } },
    }),
    listTagNames(),
  ]);

  const toClip = (video: (typeof videos)[number]): Clip => ({
    id: video.id,
    title: video.title,
    description: video.description,
    videoUrl: video.videoUrl,
    posterImageUrl: video.posterImageUrl,
    spriteUrl: video.spriteUrl,
    spriteFrames: video.spriteFrames,
    width: video.width,
    height: video.height,
    durationSeconds: video.durationSeconds,
    youtubeUrl: video.youtubeId ? youtubeWatchUrl(video.youtubeId) : '',
    rollId: video.rollId ?? '',
    tags: video.tags.map((entry) => entry.tag.name),
  });

  // Rows older than rolls, until scripts/backfill-rolls.mjs files them or they
  // are dragged onto one. Listed first and on their own rather than under the
  // first roll, where /motion shows them: here the point is to notice them.
  const unfiled = videos.filter((video) => !video.rollId);
  const groups: ClipGroup[] = [
    ...(unfiled.length ? [{ rollId: null, name: 'Not on a roll', description: '', clips: unfiled.map(toClip) }] : []),
    ...rolls.map((roll) => ({
      rollId: roll.id,
      name: roll.name,
      description: roll.description,
      clips: videos.filter((video) => video.rollId === roll.id).map(toClip),
    })),
  ];

  return (
    <MotionLibrary
      groups={groups}
      tagOptions={tagOptions}
      initial={{ query: first(params.q) ?? '', clip: first(params[CLIP_PARAM]) ?? null }}
      // Crafted input like any query parameter, so reduced to a path on this site.
      returnTo={safeNextPath(params[RETURN_PARAM], '') || null}
    />
  );
}
