'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { SectionEntry } from '@/lib/post/sections';

/**
 * "In this post": the post's sections as links, the one being read marked. On
 * a wide page it rides in the rail beside the text; on a narrower one it is a
 * short list under the title. Both are rendered and CSS shows one (see
 * .post-rail and .post-index-inline), because which applies depends on the
 * sheet's width, not the window's — the editor's phone preview is a narrow sheet
 * in a wide window.
 *
 * The highlight is the last section whose heading has scrolled past the upper
 * fifth of the screen. Reading position, never driving it: the links are
 * ordinary fragment links and scrolling stays the browser's own.
 */
export function SectionIndex({
  entries,
  variant,
  footer,
}: {
  entries: SectionEntry[];
  variant: 'rail' | 'inline';
  /** The editor's add-a-section buttons, under the list. */
  footer?: ReactNode;
}) {
  const active = useActiveSection(variant === 'rail' ? entries : []);

  if (!entries.length && !footer) return null;

  return (
    <nav aria-label="In this post" className={variant === 'rail' ? 'post-index' : 'post-index post-index--inline'}>
      {entries.length ? <p className="post-index-heading">In this post</p> : null}
      {entries.length ? (
        <ol>
          {entries.map((entry) => (
            <li key={entry.id}>
              <a href={`#${entry.anchor}`} aria-current={variant === 'rail' && entry.id === active ? 'location' : undefined}>
                {entry.label ? (
                  <span className="post-index-label">
                    {entry.label}
                    {entry.day !== null && entry.place ? ` · ${entry.place}` : ''}
                  </span>
                ) : null}
                {entry.title ? <span className="post-index-title">{entry.title}</span> : null}
              </a>
            </li>
          ))}
        </ol>
      ) : null}
      {footer}
    </nav>
  );
}

function useActiveSection(entries: SectionEntry[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = entries.map((entry) => entry.anchor).join(' ');

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
      setActive(current.replace(/^section-/, ''));
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
