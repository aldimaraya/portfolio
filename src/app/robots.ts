import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

/**
 * `/admin` and `/login` are disallowed as housekeeping, not as security — the
 * proxy gate and the per-action `isAuthenticated()` checks are what actually
 * keep anyone out, and a robots rule is a request that well-behaved crawlers
 * honour and nobody else does. The point is only to keep a sign-in form out of
 * search results. The upload and auth API routes are covered by the same rule
 * for the same reason.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/login', '/api/'] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
