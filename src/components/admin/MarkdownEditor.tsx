'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LABEL } from './fields';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Side-by-side source and preview. react-markdown does not render raw HTML unless
 * rehype-raw is added, which it deliberately is not — the preview then cannot run
 * markup that the editor pastes in.
 */
export function MarkdownEditor({ value, onChange }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Markdown</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={22}
          spellCheck
          aria-label="Markdown"
          placeholder="# A morning in Namsan&#10;&#10;Write in Markdown — the preview updates as you type."
          className="resize-y rounded border border-hairline bg-frame p-3 font-mono text-sm text-bone outline-none focus:border-gold"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Preview</span>
        <div className="prose-portfolio min-h-40 overflow-x-auto rounded border border-hairline bg-frame p-4">
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className="text-ash">Nothing to preview yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
