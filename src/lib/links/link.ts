import { z } from 'zod';

/**
 * The site's outbound links: what a stored row means, and the rules for
 * accepting one. Pure — the query lives in load.ts — so the header, which is a
 * client component, can import the icon mapping without dragging in the
 * database client.
 */

export interface SiteLink {
  label: string;
  href: string;
  profile: boolean;
}

/** Marks drawn by components/site/SiteLinks.tsx. Add the path there to add one here. */
export type LinkIcon = 'youtube' | 'github' | 'instagram' | 'vimeo';

/**
 * Registrable domain → mark. Matched on the domain and its subdomains, so
 * m.youtube.com and www.instagram.com resolve, and youtube.com.evil.test does
 * not.
 */
const ICON_DOMAINS: ReadonlyArray<[string, LinkIcon]> = [
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['github.com', 'github'],
  ['instagram.com', 'instagram'],
  ['vimeo.com', 'vimeo'],
];

/**
 * The mark for a link, derived from where it points rather than stored beside
 * it, so the two can never disagree. Null for any other host: the link is drawn
 * as its label instead, which means adding one never waits on an icon.
 */
export function linkIcon(href: string): LinkIcon | null {
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
  const match = ICON_DOMAINS.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return match ? match[1] : null;
}

/**
 * Query parameters that identify who shared a link rather than what it points
 * at. A profile copied from an app's share sheet arrives carrying one — YouTube's
 * `si`, Instagram's `igsh` — and publishing it would put the sharer's tracking id
 * on every page of the site, and in the Person schema's sameAs besides.
 */
const TRACKING_PARAM = /^(si|igsh|igshid|fbclid|gclid|utm_.+)$/i;

/** The URL without its share-tracking parameters, and without a `?` left bare. */
export function cleanHref(href: string): string {
  const url = new URL(href);
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

/** The `sameAs` URLs: the links that are this person, not places they point at. */
export function profileUrls(links: readonly SiteLink[]): string[] {
  return links.filter((link) => link.profile).map((link) => link.href);
}

/**
 * What saveLink accepts. The protocol is pinned because this string becomes an
 * `href` on every public page: `javascript:` would run in a visitor's browser,
 * and nothing but a web address belongs in a row of profile links anyway.
 */
export const linkSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, 'A link needs a label'),
  href: z
    .string()
    .trim()
    .pipe(
      z.url({
        protocol: /^https?$/,
        hostname: z.regexes.domain,
        error: 'Enter a full web address, starting with https://',
      }),
    )
    .transform(cleanHref),
  profile: z.boolean(),
});

export type LinkInput = z.input<typeof linkSchema>;
