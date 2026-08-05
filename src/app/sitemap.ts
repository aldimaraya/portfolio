import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { siteUrl } from '@/lib/site-url';

/**
 * Built at build time, alongside the pages it lists, and refreshed by the same
 * `revalidatePath` calls that rebuild them — so a post published after the
 * build appears here on the next revalidation rather than at the next deploy.
 *
 * Drafts are excluded in the query rather than filtered afterwards, matching
 * `/journal`: a draft slug 404s, and advertising a 404 to a crawler is worse
 * than omitting it.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const [posts, videos, lastPhoto] = await Promise.all([
    db.blogPost.findMany({
      where: { draft: false },
      select: { slug: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
    }),
    db.video.findMany({ select: { id: true, createdAt: true }, orderBy: { sortOrder: 'asc' } }),
    // The wall has no per-photo page, so /stills only needs the date of its
    // newest photo to carry a meaningful lastModified.
    db.photo.findFirst({ select: { createdAt: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const newestVideo = videos.reduce<Date | undefined>(
    (latest, video) => (!latest || video.createdAt > latest ? video.createdAt : latest),
    undefined,
  );

  return [
    { url: base, changeFrequency: 'monthly', priority: 1 },
    {
      url: `${base}/stills`,
      lastModified: lastPhoto?.createdAt,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${base}/motion`,
      lastModified: newestVideo,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${base}/journal`,
      lastModified: posts[0]?.publishedAt,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...videos.map((video) => ({
      url: `${base}/motion/${video.id}`,
      lastModified: video.createdAt,
      changeFrequency: 'yearly' as const,
      priority: 0.7,
    })),
    ...posts.map((post) => ({
      url: `${base}/journal/${post.slug}`,
      lastModified: post.publishedAt,
      changeFrequency: 'yearly' as const,
      priority: 0.7,
    })),
  ];
}
