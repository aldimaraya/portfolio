'use client';

/**
 * The formatting row above the Markdown textarea. Every button is a description
 * of an edit — the maths lives in src/lib/markdown/toolbar.ts, and applying it
 * to the DOM is MarkdownEditor's job. This file only decides what the buttons
 * are and what they look like.
 */

import type { Edit, Selection } from '@/lib/markdown/toolbar';
import { insertLink, toggleLinePrefix, toggleWrap } from '@/lib/markdown/toolbar';

export interface ToolbarAction {
  /** Button face. Short — the row has to survive a narrow admin column. */
  label: string;
  title: string;
  /** Lower-case key for the ⌘/Ctrl shortcut, if it has one. */
  shortcut?: string;
  run: (selection: Selection) => Edit;
}

/**
 * Ordered as they read: structure, emphasis, blocks, then links and code.
 * `link` is handled here rather than in the editor because it needs a URL, and
 * a prompt is the whole of that interaction.
 */
export const ACTIONS: ToolbarAction[] = [
  { label: 'H1', title: 'Heading 1 (⌘1)', shortcut: '1', run: (s) => toggleLinePrefix(s, '# ') },
  { label: 'H2', title: 'Heading 2 (⌘2)', shortcut: '2', run: (s) => toggleLinePrefix(s, '## ') },
  { label: 'H3', title: 'Heading 3 (⌘3)', shortcut: '3', run: (s) => toggleLinePrefix(s, '### ') },
  { label: 'B', title: 'Bold (⌘B)', shortcut: 'b', run: (s) => toggleWrap(s, '**') },
  { label: 'I', title: 'Italic (⌘I)', shortcut: 'i', run: (s) => toggleWrap(s, '*') },
  { label: '❝', title: 'Quote', run: (s) => toggleLinePrefix(s, '> ') },
  { label: '•', title: 'Bulleted list', run: (s) => toggleLinePrefix(s, '- ') },
  { label: '1.', title: 'Numbered list', run: (s) => toggleLinePrefix(s, '1. ') },
  { label: '‹›', title: 'Code', run: (s) => toggleWrap(s, '`') },
];

/** Split out because it needs a URL, which the other actions do not. */
export const LINK_ACTION: ToolbarAction = {
  label: 'Link',
  title: 'Link (⌘K)',
  shortcut: 'k',
  run: (s) => insertLink(s, ''),
};

const BUTTON_CLASS =
  'rounded border border-hairline px-2 py-1 font-mono text-xs text-ash transition hover:border-gold hover:text-gold';

interface Props {
  onAction: (action: ToolbarAction) => void;
  onLink: () => void;
  onMedia: () => void;
  /** Whether the media panel is open, so its button can read as a toggle. */
  mediaOpen: boolean;
}

export function MarkdownToolbar({ onAction, onLink, onMedia, mediaOpen }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.title}
          aria-label={action.title}
          // Buttons inside a form default to submit, which would save the post.
          onClick={() => onAction(action)}
          className={`${BUTTON_CLASS} ${action.label === 'B' ? 'font-bold' : ''} ${
            action.label === 'I' ? 'italic' : ''
          }`}
        >
          {action.label}
        </button>
      ))}

      <button type="button" title={LINK_ACTION.title} onClick={onLink} className={BUTTON_CLASS}>
        Link
      </button>

      <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />

      <button
        type="button"
        onClick={onMedia}
        aria-expanded={mediaOpen}
        className={`rounded border px-2 py-1 font-mono text-xs transition ${
          mediaOpen ? 'border-gold bg-gold/10 text-gold' : 'border-gold text-gold hover:bg-gold/10'
        }`}
      >
        + Media
      </button>
    </div>
  );
}
