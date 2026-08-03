'use client';

import { FIELD, LABEL } from './fields';

/** Matches the public FilterBar chips, and the tag pills next to it. */
const CHIP = 'rounded border px-2.5 py-1 text-xs transition';
const CHIP_ON = `${CHIP} border-gold bg-gold/10 text-gold`;
const CHIP_OFF = `${CHIP} border-white/15 text-bone hover:border-white/40`;

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Values already used by other photos, offered as one-click pills. */
  suggestions: string[];
}

/**
 * A free-text field with its own past answers underneath. Unlike [TagInput] the
 * field holds one value, so a pill *replaces* what is there rather than adding
 * to it — and clicking the selected pill clears it, since there is otherwise no
 * way to undo a mis-click without retyping.
 */
export function SuggestInput({ label, value, onChange, placeholder, suggestions }: Props) {
  const query = value.trim().toLowerCase();
  // Narrowed as you type, but never to nothing: an exact match would filter the
  // list down to the pill you just clicked and make the rest vanish.
  const shown = suggestions.filter(
    (name) => !query || name.toLowerCase().includes(query) || name === value,
  );

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <input
        className={FIELD}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {shown.length ? (
        <ul className="flex flex-wrap gap-2">
          {shown.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => onChange(name === value ? '' : name)}
                className={name === value ? CHIP_ON : CHIP_OFF}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
