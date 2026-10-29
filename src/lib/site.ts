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
export const NEWSLETTER_NAME = 'Aldi’s notebook';

/**
 * What the site is about, in a sentence, for the places a tagline is too thin to
 * do the job: the meta description and the Person schema.
 *
 * SITE_TAGLINE is nineteen characters and names no craft, which reads well under
 * the wordmark but gives a search result no reason to be clicked and the page no
 * subject beyond the name. This is deliberately the longer, plainer version.
 */
export const SITE_DESCRIPTION =
  'The life of Aldi Maraya, documented — photos, films, and a journal of ' +
  'what I’ve been up to.';

/**
 * The home page's opening line. A placeholder until the about text is written —
 * it is the first prose on the page a name search lands on, so it should say who
 * this is in the owner's own words.
 */
export const HOME_INTRO =
  'Hi, I’m Aldi. This is where I keep my life — what I’ve been up to, the ' +
  'photos I took along the way, and the occasional film.';

export const NAV_TABS = [
  { href: '/stills', label: 'Stills' },
  { href: '/motion', label: 'Motion' },
  { href: '/journal', label: 'Journal' },
] as const;
