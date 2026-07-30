'use client';

import { FIELD, LABEL } from './fields';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function TagInput({ value, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>Tags</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="street, night, tokyo"
        className={FIELD}
      />
      <span className="text-xs text-ash">
        Comma separated. New tags are created automatically.
      </span>
    </label>
  );
}
