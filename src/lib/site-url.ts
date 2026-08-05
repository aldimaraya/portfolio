/**
 * The site's own origin, for the places that need an absolute URL: `metadataBase`
 * (which every Open Graph image and canonical link is resolved against), the
 * sitemap, and robots.txt.
 *
 * Server-only. It reads `process.env` at call time, so importing this from a
 * client component would inline whatever the value was at build and silently
 * diverge — the metadata files and the two route conventions are its only
 * callers.
 *
 * Resolution order, most explicit first:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — set this once a custom domain is attached. It is
 *    the only value that survives being served from a preview deployment under
 *    the production domain's canonical identity.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel sets this automatically, and it
 *    points at the *production* domain even when the build is a preview, which
 *    is what a canonical URL should say. Carries no protocol.
 * 3. localhost, for `next build` and `next dev` off Vercel.
 *
 * Deliberately not `VERCEL_URL`: that is the per-deployment URL, unique to every
 * build, so a sitemap generated from it would advertise a hostname that stops
 * being the site the moment the next deploy lands.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}
