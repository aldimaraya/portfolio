'use client';

import { CONTENT_KINDS, KIND_LABELS, type Preferences } from '@/lib/newsletter/kinds';

/** The three opt-ins, shared by the signup form and the manage page. */
export function PreferenceFields({
  value,
  onChange,
  disabled,
}: {
  value: Preferences;
  onChange: (next: Preferences) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 font-mono text-xs tracking-[0.15em] text-ash uppercase">
        Email me about
      </legend>
      {CONTENT_KINDS.map((kind) => (
        <label key={kind} className="flex items-baseline gap-3 text-sm">
          <input
            type="checkbox"
            checked={value[kind]}
            onChange={(event) => onChange({ ...value, [kind]: event.target.checked })}
            className="translate-y-0.5 accent-[var(--color-gold)]"
          />
          <span>
            <span className="text-bone">{KIND_LABELS[kind].label}</span>
            <span className="text-ash"> — {KIND_LABELS[kind].blurb.toLowerCase()}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
