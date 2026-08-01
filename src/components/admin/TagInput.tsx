'use client';

import { useState } from 'react';
import { FIELD, LABEL } from './fields';
import { formatTagNames, parseTagNames } from '@/lib/tags/parse';

/** Matches the public FilterBar chips, so a tag looks the same on both sides. */
const CHIP = 'rounded border px-2.5 py-1 text-xs transition';
const CHIP_ON = `${CHIP} border-gold bg-gold/10 text-gold`;
const CHIP_OFF = `${CHIP} border-white/15 text-bone hover:border-white/40`;

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Every tag already in the database, offered as one-click pills. */
  suggestions: string[];
}

export function TagInput({ value, onChange, suggestions }: Props) {
  const [draft, setDraft] = useState('');

  // The comma string stays the source of truth — the pills are only a view of
  // it, so parsing in and formatting out keeps the value canonical (lowercased,
  // deduped) no matter which control edited it.
  const selected = parseTagNames(value);
  const emit = (names: string[]) => onChange(formatTagNames(parseTagNames(names.join(','))));

  const query = draft.trim().toLowerCase();
  const available = suggestions.filter(
    (name) => !selected.includes(name) && (!query || name.includes(query)),
  );

  function commitDraft() {
    const typed = parseTagNames(draft);
    if (typed.length) emit([...selected, ...typed]);
    setDraft('');
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter would otherwise submit the whole form, and a comma would just sit
      // in the draft where the pills cannot see it.
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === 'Backspace' && draft === '' && selected.length) {
      emit(selected.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>Tags</span>

      {selected.length ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => emit(selected.filter((other) => other !== name))}
                aria-label={`Remove ${name}`}
                className={CHIP_ON}
              >
                {name} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        // Typing a tag and saving without pressing Enter is the obvious mistake
        // this makes possible, so the draft commits on the way out too.
        onBlur={commitDraft}
        placeholder="Add a tag"
        aria-label="Add a tag"
        className={FIELD}
      />

      {available.length ? (
        <ul className="flex flex-wrap gap-2">
          {available.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => {
                  emit([...selected, name]);
                  setDraft('');
                }}
                className={CHIP_OFF}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <span className="text-xs text-ash">
        Click a tag to add it, or type a new one and press Enter.
      </span>
    </div>
  );
}
