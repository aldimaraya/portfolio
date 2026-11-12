'use client';

import type { ResolvedImage } from '@/lib/post/media';
import type { SectionEntry, SubsectionEntry } from '@/lib/post/sections';

/**
 * The editor's left column: the post's days and sections, always in view, and
 * the facts about the post that are not on the sheet — its address, its cover
 * and what publishing it does to the newsletter.
 *
 * A row jumps to its section; ↑/↓ move the whole section, everything under it
 * included (moveSection), which is the move a trip post actually needs — Day 3
 * belongs before Day 2 — and which dragging one block at a time cannot do.
 *
 * A section's headings are listed under it as subsections, to jump to only:
 * they move with their section, and moving one within it is a block drag on the
 * sheet like any other.
 */
export function EditorOutline({
  entries,
  subsections,
  unwritten,
  current,
  currentSubsection,
  onJump,
  onMove,
  onAddDay,
  onAddSection,
  slug,
  draft,
  cover,
  coverPicked,
  onResetCover,
}: {
  entries: SectionEntry[];
  /** Each section's headings, keyed by section id. */
  subsections: Map<string, SubsectionEntry[]>;
  /** Ids of sections with no writing under them yet, marked with a dot. */
  unwritten: Set<string>;
  /** The section holding the selected block, if any. */
  current: string | null;
  /** The listed heading over the selected block within its section, if any. */
  currentSubsection: string | null;
  onJump: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onAddDay: () => void;
  onAddSection: () => void;
  slug: string;
  draft: boolean;
  cover: ResolvedImage | null;
  /** The cover was chosen in the tray, rather than being the first photo. */
  coverPicked: boolean;
  onResetCover: () => void;
}) {
  return (
    <aside className="editor-outline" aria-label="Outline">
      <div className="editor-outline-group">
        <h2 className="editor-outline-heading">Outline</h2>
        {entries.length ? (
          <ol className="editor-outline-list">
            {entries.map((entry, at) => {
              const subs = subsections.get(entry.id) ?? [];
              return (
                <li key={entry.id} className="editor-outline-item">
                  <div
                  className="editor-outline-row"
                  data-current={(entry.id === current && !subs.some((sub) => sub.id === currentSubsection)) || undefined}
                >
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
                  </div>
                  {subs.length ? (
                    <ol className="editor-outline-subsections">
                      {subs.map((sub) => (
                        <li key={sub.id} className="editor-outline-row" data-current={sub.id === currentSubsection || undefined}>
                          <button type="button" className="editor-outline-jump" onClick={() => onJump(sub.id)}>
                            <span className="editor-outline-name">{sub.title}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              );
            })}
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
            // eslint-disable-next-line @next/next/no-img-element -- a 48px thumbnail, the tray's own copy where there is one
            <img src={cover.url} alt="" className="editor-outline-cover" />
          ) : null}
          <span className="editor-muted">
            {coverPicked
              ? 'Chosen in the tray, used for its link preview'
              : 'The first photo in the post, used for its link preview. Select one in the tray and choose Make cover to pick another'}
          </span>
          {coverPicked ? (
            <button type="button" className="editor-link-button" onClick={onResetCover}>
              Use the first photo instead
            </button>
          ) : null}
        </div>
        <div className="editor-outline-fact">
          <span>Newsletter</span>
          <span className="editor-muted">{draft ? 'Goes in the next email on publish' : 'Queued for the email when it was published'}</span>
        </div>
      </div>
    </aside>
  );
}
