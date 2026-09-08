import { SITE_DESCRIPTION, SITE_NAME, SOCIAL_LINKS } from '@/lib/site';
import { siteUrl } from '@/lib/site-url';

/**
 * Schema.org builders. Kept together so the shape of the site's structured data
 * is readable in one place, and server-only — they call siteUrl(), which reads
 * process.env at call time.
 */

/** Absolute URL for a site-relative path. Schema.org URLs may not be relative. */
function absolute(path: string): string {
  return new URL(path, siteUrl()).toString();
}

/**
 * The person the site is about. Emitted once, on /stills rather than in the root
 * layout: repeating an identical Person on every page adds nothing a crawler
 * uses. /stills because `/` only redirects there, so it is the page a name query
 * actually lands on — move this to the about page when one exists.
 *
 * `mainEntityOfPage` is what marks this site as the person's own, as opposed to
 * a page that merely mentions them.
 */
export function personSchema() {
  const url = siteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${url}/#person`,
    name: SITE_NAME,
    url,
    description: SITE_DESCRIPTION,
    jobTitle: 'Photographer and filmmaker',
    mainEntityOfPage: url,
    // Omitted rather than sent empty: an empty sameAs is a claim to no profiles,
    // which is worse than making no claim.
    ...(SOCIAL_LINKS.length > 0 && { sameAs: [...SOCIAL_LINKS] }),
  };
}

/** A journal post. `author` points at the Person by @id rather than restating it. */
export function articleSchema(post: {
  slug: string;
  title: string;
  description: string;
  publishedAt: Date;
}) {
  const url = siteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt.toISOString(),
    url: absolute(`/journal/${post.slug}`),
    mainEntityOfPage: absolute(`/journal/${post.slug}`),
    author: { '@id': `${url}/#person` },
  };
}

/**
 * A clip. `thumbnailUrl` and `uploadDate` are the two properties Google requires
 * before a video is eligible for a video result at all, so both are mandatory
 * here rather than optional.
 */
export function videoSchema(video: {
  id: string;
  title: string;
  description: string;
  posterImageUrl: string;
  createdAt: Date;
  durationSeconds: number | null;
}) {
  const url = siteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    // Schema requires a description; the title is a poorer one than a real
    // blurb but better than omitting a required property.
    description: video.description || video.title,
    thumbnailUrl: video.posterImageUrl,
    uploadDate: video.createdAt.toISOString(),
    contentUrl: absolute(`/motion/${video.id}`),
    // ISO 8601 duration, the only format Schema.org accepts. Rounded to whole
    // seconds: fractional durations are not representable in the short form.
    ...(video.durationSeconds
      ? { duration: `PT${Math.round(video.durationSeconds)}S` }
      : {}),
    creator: { '@id': `${url}/#person` },
  };
}
