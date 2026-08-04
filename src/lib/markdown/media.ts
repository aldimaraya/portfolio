/**
 * The Markdown spelling of media in a journal post, and the readers that give it
 * meaning at render time.
 *
 * A post's body never renders raw HTML — react-markdown is deliberately used
 * without rehype-raw — so a video or an embed cannot be a `<video>`/`<iframe>`
 * pasted into the body. Instead everything is written in ordinary Markdown that
 * degrades sensibly, and PostMarkdown recognises three shapes:
 *
 *   ![caption](…/x.webp)                          an image
 *   ![caption](…/x.mp4 "poster:…/p.webp")         a video, poster in the title
 *   https://youtu.be/ID                            alone in a paragraph, an embed
 *
 * Nothing here trusts its input to be well-formed: these strings come from a
 * caption box and from URLs stored on other rows, and both end up inside link
 * syntax where an unescaped bracket would change the parse.
 */

export type MediaKind = 'image' | 'video' | 'youtube';

export interface MediaRef {
  kind: MediaKind;
  url: string;
  caption?: string;
  /** Video only — the still shown before playback starts. */
  poster?: string;
}

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
 * youtu.be share link, an /embed/ or /shorts/ URL. Host is checked rather than
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
          : /^\/(embed|shorts|v)\//.test(parsed.pathname)
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

/** Neutralises the delimiters of `![caption](url "title")`. */
function escapeCaption(caption: string): string {
  return caption.replace(/([[\]\\])/g, '\\$1').replace(/\s+/g, ' ').trim();
}

/**
 * URLs are percent-escaped rather than backslash-escaped: a literal space or
 * paren in an R2 key would otherwise end the link target early. Spelled out
 * rather than left to encodeURIComponent, which leaves parens alone — they are
 * legal in a URL and only a problem in this syntax.
 */
const URL_ESCAPES: Record<string, string> = { '(': '%28', ')': '%29' };

function escapeUrl(url: string): string {
  return url
    .trim()
    .replace(/[()\s]/g, (char) => URL_ESCAPES[char] ?? encodeURIComponent(char));
}

/** The Markdown to drop into the body for a piece of media. */
export function mediaSnippet(media: MediaRef): string {
  const url = escapeUrl(media.url);
  const caption = escapeCaption(media.caption ?? '');

  // A bare URL on its own line. A caption would have to become link text, which
  // would stop it being a lone link and so stop it being an embed.
  if (media.kind === 'youtube') return url;

  const title = media.kind === 'video' && media.poster ? ` "${POSTER_PREFIX}${escapeUrl(media.poster)}"` : '';
  return `![${caption}](${url}${title})`;
}
