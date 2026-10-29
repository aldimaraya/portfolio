/**
 * Readers for the media URLs a journal post can name.
 *
 * Posts written in Markdown spelled media in three shapes, which
 * lib/markdown/legacy.ts recognises when it converts them to blocks:
 *
 *   ![caption](…/x.webp)                          an image
 *   ![caption](…/x.mp4 "poster:…/p.webp")         a video, poster in the title
 *   https://youtu.be/ID                            alone in a paragraph, an embed
 *
 * The YouTube and optimisable-host checks are also what the block renderer uses
 * for embed blocks and for images that were never in our own tables.
 */

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v'];

/** The path part of a URL, or the whole string if it does not parse as one. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

/** Whether a Markdown image target is really a video file. */
export function isVideoUrl(url: string): boolean {
  const path = pathOf(url).toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/**
 * The YouTube video id in a URL, or null for anything else — a watch link, a
 * youtu.be share link, an /embed/, /shorts/ or /live/ URL. Host is checked rather than
 * pattern-matched loosely, so an arbitrary link is never turned into an iframe
 * pointed at someone else's domain.
 */
export function youtubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '');
  const id =
    host === 'youtu.be'
      ? parsed.pathname.slice(1)
      : host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com'
        ? parsed.pathname === '/watch'
          ? (parsed.searchParams.get('v') ?? '')
          : /^\/(embed|shorts|live|v)\//.test(parsed.pathname)
            ? parsed.pathname.split('/')[2]
            : ''
        : '';

  // YouTube ids are a fixed 11-character url-safe alphabet. Anything else is a
  // channel page or a playlist, which has no single video to embed.
  return /^[\w-]{11}$/.test(id) ? id : null;
}

/** The privacy-preserving embed URL for a video id. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

/**
 * The canonical watch URL for a video id — what a clip's YouTube link points at.
 * Rebuilt from the id rather than kept as pasted, so it never carries a share
 * link's tracking parameters.
 */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Whether an image URL may be handed to next/image.
 *
 * Load-bearing, not an optimisation: next/image throws on a host that is not in
 * `remotePatterns`, and a throw during render takes the entire page with it. A
 * post can name any image on the web — the body is whatever Markdown was typed —
 * so anything off our own bucket has to fall back to a plain <img>, which shows
 * a broken image at worst instead of a crashed page.
 *
 * Relative URLs are same-origin and always allowed.
 */
export function isOptimisableUrl(url: string, allowedHost: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  if (!allowedHost) return false;

  try {
    return new URL(url).hostname === allowedHost;
  } catch {
    return false;
  }
}

const POSTER_PREFIX = 'poster:';

/** The poster URL carried in a video image's Markdown title, if any. */
export function posterFromTitle(title?: string | null): string | null {
  if (!title || !title.startsWith(POSTER_PREFIX)) return null;
  const url = title.slice(POSTER_PREFIX.length).trim();
  return url || null;
}
