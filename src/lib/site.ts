/**
 * Single source of truth for header branding. Never hardcode the name or
 * tagline anywhere else. (The mockup's "Alex Morgan" was a placeholder.)
 */
export const SITE_NAME = 'Aldi Maraya';
export const SITE_TAGLINE = 'My life, documented';

/**
 * What the newsletter calls the site in a subject line. The bare name reads as
 * a person emailing you, not a site you subscribed to — "Confirm your
 * subscription to Aldi Maraya" is odd in an inbox in a way the wordmark is not.
 */
export const NEWSLETTER_NAME = 'Aldi’s portfolio';

/**
 * What the site is about, in a sentence, for the places a tagline is too thin to
 * do the job: the meta description and the Person schema.
 *
 * SITE_TAGLINE is nineteen characters and names no craft, which reads well under
 * the wordmark but gives a search result no reason to be clicked and the page no
 * subject beyond the name. This is deliberately the longer, plainer version.
 */
export const SITE_DESCRIPTION =
  'Photography and films by Aldi Maraya — a wall of stills, a roll of motion ' +
  'work, and a journal about how they were made.';

/** Marks drawn by components/site/SiteLinks.tsx. Add the path there to add one here. */
export type SiteIcon = 'youtube' | 'github';

export interface SiteLink {
  /** Visible only for a link without an icon; otherwise its accessible name and tooltip. */
  label: string;
  href: string;
  icon?: SiteIcon;
  /**
   * An account that *is* this person — Instagram, Vimeo, GitHub — as opposed to
   * somewhere they merely point at, like a shop or a print lab. Only profiles
   * become the Person schema's `sameAs` and carry `rel="me"`: claiming a store
   * as your identity is a claim a search engine has no reason to believe.
   */
  profile?: boolean;
}

/**
 * The footer's link row, in display order, and the source of the Person
 * schema's `sameAs` — how a search engine connects the site to accounts that
 * already rank for the name. Empty renders no row at all.
 *
 * A profile is worth very little to `sameAs` until it also links back here: the
 * corroboration has to run both ways, and a one-way claim is one anybody could
 * make.
 */
export const SITE_LINKS: readonly SiteLink[] = [
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@aldisfilmroll',
    icon: 'youtube',
    profile: true,
  },
  { label: 'GitHub', href: 'https://github.com/aldimaraya', icon: 'github', profile: true },
];

/** The `sameAs` URLs: the links that are this person, not places they point at. */
export function profileUrls(links: readonly SiteLink[]): string[] {
  return links.filter((link) => link.profile).map((link) => link.href);
}

export const NAV_TABS = [
  { href: '/stills', label: 'Stills' },
  { href: '/motion', label: 'Motion' },
  { href: '/journal', label: 'Journal' },
] as const;
