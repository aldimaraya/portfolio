import type { Block, BlockOf } from '@/lib/post/content';
import type { PostMedia } from '@/lib/post/media';
import { sectionAnchor, type SectionEntry } from '@/lib/post/sections';
import { isVideoUrl, youtubeEmbedUrl, youtubeId } from '@/lib/markdown/media';
import { PostPhotos } from './PostPhotos';
import { RichText } from './RichText';

/**
 * How one block sits on the sheet: which row variant it takes and what goes in
 * its margin. Shared by the published page and the editor, which wraps the same
 * row in its selection and toolbar — so a block cannot be laid out one way while
 * writing and another once published.
 */
export function rowClass(block: Block): string {
  if (block.type === 'section') return 'post-row post-row--section';
  if (block.type === 'photos' && block.size === 'wide') return 'post-row post-row--wide';
  if (block.type === 'photos' && block.size === 'full') return 'post-row post-row--full';
  return 'post-row';
}

/** The anchor a block's row carries, for the blocks the index can link to. */
export function rowAnchor(block: Block): string | undefined {
  return block.type === 'section' || block.type === 'heading' ? sectionAnchor(block.id) : undefined;
}

/** A section's margin: its label, then its date and place. */
export function SectionMargin({ entry }: { entry: SectionEntry | undefined }) {
  if (!entry) return null;
  return (
    <>
      {entry.label ? <span className="post-margin-label">{entry.label}</span> : null}
      {entry.date ? <span className="post-margin-meta">{entry.date}</span> : null}
      {entry.place ? <span className="post-margin-meta">{entry.place}</span> : null}
    </>
  );
}

/** The published rendering of one block's content — everything but its margin. */
export function PostBlock({ block, media }: { block: Block; media: PostMedia }) {
  switch (block.type) {
    case 'section':
      return block.title.trim() ? <h2 className="post-section-title">{block.title}</h2> : null;
    case 'text':
      return (
        <div className="prose-portfolio post-prose">
          <RichText doc={block.body} />
        </div>
      );
    case 'heading':
      return <h3 className="post-heading">{block.text}</h3>;
    case 'photos':
      return <PostPhotos block={block} media={media} />;
    case 'tip':
      return <Tip block={block} />;
    case 'list':
      return <PackingList block={block} />;
    case 'clip':
      return <Clip block={block} media={media} />;
    case 'embed':
      return <Embed block={block} />;
    case 'quote':
      return block.text.trim() ? <blockquote className="post-quote">{block.text}</blockquote> : null;
    case 'divider':
      return <hr className="post-divider" />;
  }
}

export function Tip({ block }: { block: BlockOf<'tip'> }) {
  return (
    <aside className="post-tip">
      <p className="post-tip-title">
        <BulbIcon />
        {block.title || 'Tip'}
      </p>
      <div className="prose-portfolio post-prose">
        <RichText doc={block.body} />
      </div>
    </aside>
  );
}

function PackingList({ block }: { block: BlockOf<'list'> }) {
  return (
    <div className="post-list">
      {block.groups.map((group, index) => {
        const items = group.items.filter((item) => item.name.trim() || item.note.trim());
        if (!items.length) return null;
        return (
          <section key={index} className="post-list-group">
            {group.name.trim() ? <h4>{group.name}</h4> : null}
            <ul>
              {items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <span className="post-list-name">{item.name}</span>
                  {item.note.trim() ? <span className="post-list-note">{item.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Clip({ block, media }: { block: BlockOf<'clip'>; media: PostMedia }) {
  const clip = media.clips[block.videoId];
  if (!clip) return null;
  const caption = block.caption.trim() || clip.title;
  const ratio = clip.width && clip.height ? clip.width / clip.height : 16 / 9;

  return (
    <figure className="post-figure">
      {/* Straight from R2, like the motion reel: no autoplay, so there is
          nothing here for prefers-reduced-motion to switch off. */}
      <video
        src={clip.videoUrl}
        poster={clip.posterImageUrl || undefined}
        controls
        playsInline
        preload="none"
        className="post-video"
        style={{ aspectRatio: ratio }}
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export function Embed({ block }: { block: BlockOf<'embed'> }) {
  const url = block.url.trim();
  if (!url) return null;
  const id = youtubeId(url);
  const caption = block.caption.trim();

  if (id) {
    return (
      <figure className="post-embed">
        <div className="embed-frame">
          <iframe
            src={youtubeEmbedUrl(id)}
            title={caption || 'YouTube video'}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  }

  // A video file a Markdown post linked that matches no clip in the reel. Any
  // other link — a half-pasted one, a page rather than a video — shows nothing.
  if (!isVideoUrl(url)) return null;
  return (
    <figure className="post-figure">
      <video src={url} poster={block.poster} controls playsInline preload="none" className="post-video" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export function BulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  );
}
