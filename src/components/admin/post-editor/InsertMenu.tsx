'use client';

import { useEffect, useRef } from 'react';
import type { Insertable } from '@/lib/post/editor';

const ITEMS: { kind: Insertable; glyph: string; label: string; hint: string }[] = [
  { kind: 'day', glyph: '01', label: 'New day', hint: 'Numbered for you; date and place go in the margin' },
  { kind: 'section', glyph: '§', label: 'New section', hint: 'Name it anything: Before you go, Packing, Costs' },
  { kind: 'text', glyph: '¶', label: 'Text', hint: 'Paragraphs, lists and links' },
  { kind: 'heading', glyph: 'H', label: 'Heading', hint: 'A smaller heading inside a section' },
  { kind: 'photos', glyph: '▦', label: 'Photos', hint: 'Stacked, a row, a grid or a carousel' },
  { kind: 'tip', glyph: '!', label: 'Tip', hint: 'A travel hack, set apart from the story' },
  { kind: 'list', glyph: '≡', label: 'List with notes', hint: 'What I bring: each item with a reason' },
  { kind: 'clip', glyph: '▶', label: 'Clip', hint: 'A clip from Motion' },
  { kind: 'embed', glyph: '↗', label: 'YouTube', hint: 'A video hosted on YouTube' },
  { kind: 'quote', glyph: '“', label: 'Quote', hint: 'A line worth pulling out' },
  { kind: 'divider', glyph: '—', label: 'Divider', hint: 'A pause between parts' },
];

/**
 * Where a new block goes in: a small + sitting on the margin rule between two
 * blocks, or the full-width "Add a block" at the end of the post.
 */
export function InsertPoint({
  open,
  last,
  onToggle,
  onPick,
}: {
  open: boolean;
  /** The end of the post, which gets a full-width button rather than a +. */
  last: boolean;
  onToggle: () => void;
  onPick: (kind: Insertable) => void;
}) {
  const menu = <InsertMenu onPick={onPick} onClose={onToggle} />;

  if (last) {
    return (
      <div className="post-row editor-insert-end">
        <div className="post-margin" />
        <div className="post-cell">
          <button type="button" className="editor-add-block" aria-expanded={open} onClick={onToggle}>
            <Plus /> Add a block: a day, a section, text, photos…
          </button>
          {open ? <div className="editor-insert-menu editor-insert-menu--end">{menu}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="editor-insert">
      <button type="button" className="editor-insert-plus" data-open={open || undefined} aria-label="Add a block here" aria-expanded={open} onClick={onToggle}>
        <Plus />
      </button>
      {open ? <div className="editor-insert-menu">{menu}</div> : null}
    </div>
  );
}

function InsertMenu({ onPick, onClose }: { onPick: (kind: Insertable) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus the first entry so the menu is usable from the keyboard, and let
  // Escape put it away.
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Add a block"
      className="editor-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
          const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
          next?.focus();
        }
      }}
    >
      <p className="editor-menu-heading">Add a block</p>
      {ITEMS.map((item) => (
        <button key={item.kind} type="button" role="menuitem" onClick={() => onPick(item.kind)}>
          <span className="editor-menu-glyph" aria-hidden="true">
            {item.glyph}
          </span>
          <span>
            <span className="editor-menu-label">{item.label}</span>
            <span className="editor-menu-hint">{item.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Plus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
