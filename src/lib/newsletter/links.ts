import { randomBytes } from 'node:crypto';

/**
 * A subscriber's token: 24 random bytes, URL-safe. It is the whole credential
 * behind the confirm, manage and unsubscribe links, so it is unguessable rather
 * than derived from anything stored alongside it.
 */
export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

// Tokens travel in the query string rather than the path so every link can be
// built the same way; the pages read them with `searchParams`.

export function confirmUrl(site: string, token: string): string {
  return `${site}/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

export function manageUrl(site: string, token: string): string {
  return `${site}/newsletter/manage?token=${encodeURIComponent(token)}`;
}

/**
 * The RFC 8058 one-click target in each digest's List-Unsubscribe header. Only
 * a POST acts on it — see app/api/newsletter/unsubscribe.
 */
export function unsubscribeUrl(site: string, token: string): string {
  return `${site}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** The headers that put an "Unsubscribe" button in Gmail's and Apple Mail's own UI. */
export function unsubscribeHeaders(site: string, token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl(site, token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
