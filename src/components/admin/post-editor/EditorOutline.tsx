'use client';

import type { ResolvedImage } from '@/lib/post/media';
import type { SectionEntry } from '@/lib/post/sections';

/**
 * The editor's left column: the post's days and sections, always in view, and
 * the facts about the post that are not on the sheet — its address, its cover
 * and what publishing it does to the newsletter.
 *
 * A row jumps to its section; ↑/↓ move the whole section, everything under it
 * included (moveSection), which is the move a trip post actually needs — Day 3
 * belongs before Day 2 — and which dragging one block at a time cannot do.
 */
export function EditorOutline({
  entries,
  unwritten,
  current,
  onJump,
  onMove,
  onAddDay,
  onAddSection,
  slug,
  draft,
  cover,
}: {
  entries: SectionEntry[];
  /** Ids of sections with no writing under them yet, marked with a dot. */
  unwritten: Set<string>;
  /** The section holding the selected block, if any. */
  current: string | null;
  onJump: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onAddDay: () => void;
  onAddSection: () => void;
  slug: string;
  draft: boolean;
  cover: ResolvedImage | null;
}) {
  return (
    <aside className="editor-outline" aria-label="Outline">
      <div className="editor-outline-group">
        <h2 className="editor-outline-heading">Outline</h2>
        {entries.length ? (
          <ol className="editor-outline-list">
            {entries.map((entry, at) => (
              <li key={entry.id} className="editor-outline-row" data-current={entry.id === current || undefined}>
                <button type="button" className="editor-outline-jump" onClick={() => onJump(entry.id)}>
                  <span className="editor-outline-number" aria-hidden="true">
                    {entry.day !== null ? String(entry.day).padStart(2, '0') : '§'}
                  </span>
                  <span className="editor-outline-name">{entry.title || entry.label || 'Untitled'}</span>
                  {unwritten.has(entry.id) ? (
                    <span className="editor-outline-dot" title="No text yet">
                      <span className="sr-only">, no text yet</span>
                    </span>
                  ) : null}
                </button>
                <span className="editor-outline-moves">
                  <button
                    type="button"
                    aria-label={`Move ${entry.label || entry.title || 'section'} up`}
                    disabled={at === 0}
                    onClick={() => onMove(entry.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${entry.label || entry.title || 'section'} down`}
                    disabled={at === entries.length - 1}
                    onClick={() => onMove(entry.id, 1)}
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="editor-muted editor-outline-empty">No days or sections yet.</p>
        )}
        <div className="editor-outline-add">
          <button type="button" className="editor-button" onClick={onAddDay}>
            + Day
          </button>
          <button type="button" className="editor-button" onClick={onAddSection}>
            + Section
          </button>
        </div>
      </div>

      <div className="editor-outline-group editor-outline-post">
        <h2 className="editor-outline-heading">Post</h2>
        <div className="editor-outline-fact">
          <span>Address</span>
          <span className="editor-outline-mono">/journal/{slug}</span>
          <span className="editor-muted">{draft ? 'Follows the title until published' : 'Fixed, so links keep working'}</span>
        </div>
        <div className="editor-outline-fact">
          <span>Cover</span>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- a 48px thumbnail of a photo the sheet already loads
            <img src={cover.url} alt="" className="editor-outline-cover" />
          ) : null}
          <span className="editor-muted">The first photo in the post, used for its link preview</span>
        </div>
        <div className="editor-outline-fact">
          <span>Newsletter</span>
          <span className="editor-muted">{draft ? 'Goes in the next email on publish' : 'Queued for the email when it was published'}</span>
        </div>
      </div>
    </aside>
  );
}
