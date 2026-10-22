import type { ReactNode } from 'react';
import type { SectionEntry } from '@/lib/post/sections';
import { SectionIndex } from './SectionIndex';

/**
 * The page a post is written on, shared by the published post and the editor:
 * a margin for dates and section labels, a text column at a reading measure,
 * and a rail holding the "In this post" index — so a post spends the site's
 * full width the way the stills and motion pages do, without stretching its
 * lines past what reads comfortably.
 *
 * Every breakpoint is a container query on .post-frame rather than a media
 * query, so the editor's phone preview — a narrow sheet in a wide window —
 * collapses exactly as a phone does.
 */
export function PostSheet({
  margin,
  title,
  index,
  indexFooter,
  children,
  after,
  frameClassName,
}: {
  /** Beside the title: the publication date, or "Draft" in the editor. */
  margin: ReactNode;
  title: ReactNode;
  index: SectionEntry[];
  indexFooter?: ReactNode;
  children: ReactNode;
  /** Below the body, across the sheet — the newsletter signup on a post. */
  after?: ReactNode;
  frameClassName?: string;
}) {
  return (
    <div className={frameClassName ? `post-frame ${frameClassName}` : 'post-frame'}>
      <article className="post-sheet">
        <div className="post-layout">
          <div className="post-body">
            <header className="post-row post-row--title">
              <div className="post-margin">{margin}</div>
              <div className="post-cell">{title}</div>
            </header>
            <div className="post-index-inline">
              <SectionIndex entries={index} variant="inline" />
            </div>
            {children}
          </div>
          <aside className="post-rail">
            <SectionIndex entries={index} variant="rail" footer={indexFooter} />
          </aside>
        </div>
        {after}
      </article>
    </div>
  );
}
