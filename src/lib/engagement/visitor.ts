import { createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Who a like or a view belongs to, on a site with no accounts. Two different
 * answers, because the two need different things.
 *
 * A like has to be remembered for as long as the visitor might come back and
 * take it back, so it gets a random id in a cookie — set only when they click,
 * which makes it a cookie for something they asked for rather than one that
 * follows them around. What is stored is a hash of the id, never the id.
 *
 * A view only has to be told apart from a reload the same day, so it gets no
 * cookie at all: a hash of the address and user agent, keyed with a secret that
 * changes every day. Same visitor, same day, same hash; tomorrow, a hash that
 * cannot be matched to today's, and the address itself is never written down.
 */

export const VISITOR_COOKIE = 'portfolio_visitor';
export const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** 24 random bytes, URL-safe — the same shape as a subscriber's token. */
export function newVisitorId(): string {
  return randomBytes(24).toString('base64url');
}

/** Whether a cookie value is one this module could have issued. Anything else is
 *  treated as no cookie, and replaced. */
export function isVisitorId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

/**
 * Unkeyed, which is fine here and would not be for the view hash below: the
 * input is 192 random bits, so there is nothing to guess it from.
 */
export function hashVisitor(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

/** The UTC day containing `now`, as midnight — what View.day stores. */
export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Domain separation, so this can never derive the same key as the session's HKDF. */
const VIEW_KEY_INFO = 'portfolio view key v1';

/**
 * The day's view hash for one visitor. Keyed, and the key matters: there are
 * only four billion IPv4 addresses and a few hundred common user agents, so an
 * unkeyed hash of the two is a lookup table away from the address it was meant
 * to hide. The key is derived per day from the server secret, which is what
 * makes yesterday's hashes unlinkable to today's even for someone holding the
 * table.
 */
export function viewerHash(secret: string, day: Date, address: string, userAgent: string): string {
  const key = Buffer.from(hkdfSync('sha256', secret, day.toISOString(), VIEW_KEY_INFO, 32));
  return createHmac('sha256', key).update(`${address}\n${userAgent}`).digest('hex');
}

/**
 * Crawlers and link unfurlers, which would otherwise count a view for every
 * page they fetch. Only the ones that announce themselves — anything quieter
 * gets the per-address throttle instead. A missing user agent is not a browser.
 */
const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|python|curl|wget/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}
