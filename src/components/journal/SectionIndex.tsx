'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { IndexEntry } from '@/lib/post/sections';

/**
 * "In this post": the post's sections as links, the one being read marked. On
 * a wide page it rides in the rail beside the text; on a narrower one it is a
 * short list under the title. Both are rendered and CSS shows one (see
 * .post-rail and .post-index-inline), because which applies depends on the
 * sheet's width, not the window's — the editor's phone preview is a narrow sheet
 * in a wide window.
 *
 * The highlight is the last section or subsection whose heading has scrolled
 * past the upper fifth of the screen. Inside a subsection its section stays
 * lit too, so the gold rule keeps saying which part of the post this is.
 * Reading position, never driving it: the links are ordinary fragment links and
 * scrolling stays the browser's own.
 *
 * Subsections are listed in the rail only. The inline list sits under the title
 * on a narrow sheet, ahead of the writing, and every subsection there pushes the
 * first paragraph further down a phone screen.
 */
export function SectionIndex({
  entries,
  variant,
  footer,
}: {
  entries: IndexEntry[];
  variant: 'rail' | 'inline';
  /** The editor's add-a-section buttons, under the list. */
  footer?: ReactNode;
}) {
  const rail = variant === 'rail';
  const active = useActiveAnchor(rail ? entries : []);

  if (!entries.length && !footer) return null;

  return (
    <nav aria-label="In this post" className={variant === 'rail' ? 'post-index' : 'post-index post-index--inline'}>
      {entries.length ? <p className="post-index-heading">In this post</p> : null}
      {entries.length ? (
        <ol>
          {entries.map((entry) => {
            const subsections = rail ? entry.subsections : [];
            const here = rail && active === entry.anchor;
            const within = rail && subsections.some((sub) => sub.anchor === active);
            return (
              <li key={entry.id}>
                <a
                  href={`#${entry.anchor}`}
                  aria-current={here ? 'location' : undefined}
                  data-within={within || undefined}
                >
                  {entry.label ? (
                    <span className="post-index-label">
                      {entry.label}
                      {entry.day !== null && entry.place ? ` · ${entry.place}` : ''}
                    </span>
                  ) : null}
                  {entry.title ? <span className="post-index-title">{entry.title}</span> : null}
                </a>
                {subsections.length ? (
                  <ol className="post-index-subsections">
                    {subsections.map((sub) => (
                      <li key={sub.id}>
                        <a href={`#${sub.anchor}`} aria-current={active === sub.anchor ? 'location' : undefined}>
                          <span className="post-index-title">{sub.title}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {footer}
    </nav>
  );
}

/** The anchor of the section or subsection being read, in reading order. */
function useActiveAnchor(entries: IndexEntry[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = entries.flatMap((entry) => [entry.anchor, ...entry.subsections.map((sub) => sub.anchor)]).join(' ');

  useEffect(() => {
    if (!key) return;
    const anchors = key.split(' ');

    const update = () => {
      const line = window.innerHeight * 0.2;
      let current = anchors[0];
      for (const anchor of anchors) {
        const element = document.getElementById(anchor);
        if (element && element.getBoundingClientRect().top <= line) current = anchor;
      }
      setActive(current);
    };

    update();
    // Capture, so it also hears the editor's own scrolling surface, which is not
    // the window.
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, [key]);

  return active;
}
