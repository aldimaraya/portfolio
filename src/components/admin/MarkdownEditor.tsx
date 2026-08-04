'use client';

import { useRef, useState } from 'react';
import { PostMarkdown } from '@/components/markdown/PostMarkdown';
import { insertBlock, insertLink, type Edit } from '@/lib/markdown/toolbar';
import { LABEL } from './fields';
import { MarkdownToolbar, ACTIONS, LINK_ACTION, type ToolbarAction } from './MarkdownToolbar';
import { MediaPicker } from './MediaPicker';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Side-by-side source and preview, with a formatting toolbar over the source.
 *
 * The preview goes through PostMarkdown — the same renderer the published page
 * uses — so what is written is what appears. Raw HTML stays unrendered there,
 * which is why media is inserted as Markdown rather than as markup.
 */
export function MarkdownEditor({ value, onChange }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  /**
   * Puts an edit back into the textarea and restores the selection it asked
   * for. The focus and setSelectionRange have to wait a frame: React has not
   * written the new value yet, so setting a range now would be against the old
   * text and get clobbered by the re-render.
   */
  function apply(edit: Edit) {
    onChange(edit.value);
    requestAnimationFrame(() => {
      const element = textarea.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(edit.start, edit.end);
    });
  }

  /** The textarea's current state in the shape the pure helpers take. */
  function selection() {
    const element = textarea.current;
    if (!element) return { value, start: value.length, end: value.length };
    return { value, start: element.selectionStart, end: element.selectionEnd };
  }

  function run(action: ToolbarAction) {
    apply(action.run(selection()));
  }

  function promptForLink() {
    const url = window.prompt('Link to where?')?.trim();
    if (!url) return;
    apply(insertLink(selection(), url));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Meta on macOS, Ctrl elsewhere. Alt is excluded so ⌥⌘B and friends still
    // reach the browser.
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === LINK_ACTION.shortcut) {
      event.preventDefault();
      promptForLink();
      return;
    }

    const action = ACTIONS.find((candidate) => candidate.shortcut === key);
    if (!action) return;
    event.preventDefault();
    run(action);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Markdown</span>

        <MarkdownToolbar
          onAction={run}
          onLink={promptForLink}
          onMedia={() => setMediaOpen((open) => !open)}
          mediaOpen={mediaOpen}
        />

        {mediaOpen ? (
          <MediaPicker
            onInsert={(markdown) => apply(insertBlock(selection(), markdown))}
            onClose={() => setMediaOpen(false)}
          />
        ) : null}

        <textarea
          ref={textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={22}
          spellCheck
          aria-label="Markdown"
          placeholder="# A morning in Namsan&#10;&#10;Write in Markdown, or use the buttons above — the preview updates as you type."
          className="resize-y rounded border border-hairline bg-frame p-3 font-mono text-sm text-bone outline-none focus:border-gold"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Preview</span>
        <div className="prose-portfolio min-h-40 overflow-x-auto rounded border border-hairline bg-frame p-4">
          {value.trim() ? <PostMarkdown>{value}</PostMarkdown> : <p className="text-ash">Nothing to preview yet.</p>}
        </div>
      </div>
    </div>
  );
}
