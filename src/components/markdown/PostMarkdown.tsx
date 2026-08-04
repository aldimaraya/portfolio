import Image from 'next/image';
import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  isOptimisableUrl,
  isVideoUrl,
  posterFromTitle,
  youtubeEmbedUrl,
  youtubeId,
} from '@/lib/markdown/media';

/**
 * The one renderer for a post's body, shared by the public page and the admin
 * preview so a post cannot look one way while writing and another once
 * published — the same invariant `.prose-portfolio` exists to hold.
 *
 * Raw HTML stays inert: rehype-raw is deliberately absent, so nothing a post
 * pastes in becomes markup. Media is instead ordinary Markdown given meaning
 * here — see src/lib/markdown/media.ts for the three shapes.
 */

/** Width of the prose column, which is what an image is actually laid out at. */
const PROSE_SIZES = '(max-width: 640px) 100vw, 42rem';

/** Intrinsic size for next/image. A post never records the real dimensions, and
 *  the CSS caps the width anyway, so these only set the request's upper bound. */
const NOMINAL_WIDTH = 1600;
const NOMINAL_HEIGHT = 1200;

/** Set from next.config's `env`, which derives it from R2_PUBLIC_BASE_URL. */
const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_HOST ?? '';

function Caption({ children }: { children: string }) {
  return children ? <figcaption>{children}</figcaption> : null;
}

function MediaFigure({ src, alt, title }: { src: string; alt: string; title?: string }) {
  const poster = posterFromTitle(title);

  return (
    <figure>
      {isVideoUrl(src) ? (
        // Straight from R2, like the motion reel: no autoplay, so there is
        // nothing here for prefers-reduced-motion to switch off.
        <video
          src={src}
          poster={poster ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="w-full"
        />
      ) : isOptimisableUrl(src, MEDIA_HOST) ? (
        <Image
          src={src}
          alt={alt}
          title={title}
          width={NOMINAL_WIDTH}
          height={NOMINAL_HEIGHT}
          sizes={PROSE_SIZES}
          className="h-auto w-full"
        />
      ) : (
        /* An image from outside our own bucket. Not optimisable, and not worth
           crashing the page over — see isOptimisableUrl. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt={alt} title={title} loading="lazy" decoding="async" className="h-auto w-full" />
      )}
      {/* The caption doubles as alt text — one field, so it cannot be written
          for sighted readers only. */}
      <Caption>{alt}</Caption>
    </figure>
  );
}

function YouTubeEmbed({ id }: { id: string }) {
  return (
    <div className="embed-frame">
      <iframe
        src={youtubeEmbedUrl(id)}
        title="YouTube video"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

/**
 * react-markdown hands components the *hast* node, not the mdast one — so the
 * shapes below are `element`/`tagName`, and an image is an `img` rather than an
 * `image`. Getting this wrong fails silently: the check just never matches and
 * the figure stays wrapped in a paragraph.
 */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/**
 * The node's only child, ignoring whitespace between elements — a paragraph
 * written across two source lines can carry a stray newline text node that
 * would otherwise make a lone image look like mixed content.
 */
function onlyChild(node: unknown): HastNode | null {
  const children = (node as HastNode | undefined)?.children ?? [];
  const meaningful = children.filter((child) => !(child.type === 'text' && !child.value?.trim()));
  return meaningful.length === 1 ? meaningful[0] : null;
}

/**
 * Whether a paragraph holds nothing but one link, which is what marks a URL as
 * an embed rather than a mention. A sentence with a link in it has text either
 * side and so is left alone.
 */
function loneLinkHref(node: unknown): string | null {
  const only = onlyChild(node);
  if (only?.tagName !== 'a') return null;
  const href = only.properties?.href;
  return typeof href === 'string' ? href : null;
}

/** Whether a paragraph's only child is an image, i.e. a block-level figure. */
function isLoneImage(node: unknown): boolean {
  return onlyChild(node)?.tagName === 'img';
}

const components: Components = {
  img({ src, alt, title }) {
    if (typeof src !== 'string') return null;
    return <MediaFigure src={src} alt={alt ?? ''} title={title} />;
  },

  // Only href and title are carried over rather than spreading the rest: the
  // props include the hast `node`, which passed to the DOM renders as the string
  // node="[object Object]" on every link in the post.
  a({ href, title, children }) {
    return (
      <a href={href} title={title} rel="noreferrer">
        {children}
      </a>
    );
  },

  /**
   * The paragraph is where media is recognised, because "alone in a paragraph"
   * is only visible from here — a link renderer sees the link and not what
   * surrounds it, and a URL mentioned mid-sentence must stay a link.
   *
   * It is also where the wrapper has to go: a <figure> or <iframe> inside a <p>
   * is invalid HTML, so the browser closes the paragraph early and React warns.
   */
  p({ node, children }) {
    const href = loneLinkHref(node);
    const id = href ? youtubeId(href) : null;
    if (id) return <YouTubeEmbed id={id} />;
    if (isLoneImage(node)) return <>{children}</>;
    return <p>{children}</p>;
  },
};

export function PostMarkdown({ children }: { children: string }): ReactNode {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
