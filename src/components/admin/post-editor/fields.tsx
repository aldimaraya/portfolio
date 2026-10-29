'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { listPostMedia, type PostMediaLibrary } from '@/app/admin/posts/actions';

/**
 * A text field that looks like the text it holds — no box, the sheet's own type
 * — and grows to fit, so a title or a quote is edited where it will be read.
 * A textarea rather than contenteditable: plain text is all these hold, and a
 * native field brings undo, spellcheck and IME input without any of
 * contenteditable's edge cases.
 */
export function GrowingText({
  value,
  onChange,
  placeholder,
  className,
  label,
  singleLine = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
  label: string;
  /** Enter does not add a line — titles, labels and captions. */
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Before paint, so the field never shows a scrollbar for a frame as it grows.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={label}
      placeholder={placeholder}
      spellCheck
      onChange={(event) => onChange(singleLine ? event.target.value.replace(/\n/g, ' ') : event.target.value)}
      onKeyDown={(event) => {
        if (singleLine && event.key === 'Enter') event.preventDefault();
      }}
      className={`editor-field ${className}`}
    />
  );
}

/**
 * The stills and clips already on the site, loaded the first time anything asks
 * and shared by every picker after that — it is every row of both tables, and a
 * post that never reaches for the library never pays for it.
 */
let libraryRequest: Promise<PostMediaLibrary> | null = null;

export function useLibrary(enabled: boolean): PostMediaLibrary | null {
  const [library, setLibrary] = useState<PostMediaLibrary | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    libraryRequest ??= listPostMedia();
    libraryRequest.then((result) => {
      if (!cancelled) setLibrary(result);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return library;
}
