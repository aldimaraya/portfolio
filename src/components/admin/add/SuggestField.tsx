'use client';

import { useId, useRef, useState } from 'react';
import { fold } from '@/lib/filters/facets';
import { formatTagNames, parseTagNames } from '@/lib/tags/parse';

/**
 * The queue's text fields with past answers to pick from. A native <datalist>
 * would do the filtering for free, but its popup is drawn by the browser — a
 * white system list on this dark page — and cannot be styled at all, so the
 * list is ours: a listbox under the field, driven from the keyboard as well.
 */

/** The dropdown's own look, shared by every list here so they read as one control. */
const LIST =
  'absolute inset-x-0 top-[calc(100%+4px)] z-30 min-w-48 max-h-60 overflow-y-auto overscroll-contain rounded-md border border-white/12 bg-frame py-1 text-sm shadow-[0_12px_32px_rgba(0,0,0,0.55)] motion-safe:animate-[fade-in_120ms_ease-out]';

/** The longest list worth scrolling through; typing narrows it from there. */
const MAX_SHOWN = 50;

function matches(options: string[], query: string, exclude: (option: string) => boolean): string[] {
  const needle = fold(query);
  return options.filter((option) => !exclude(option) && (!needle || fold(option).includes(needle))).slice(0, MAX_SHOWN);
}

function Suggestions({
  id,
  options,
  active,
  onPick,
  onHover,
}: {
  id: string;
  options: string[];
  active: number;
  onPick: (option: string) => void;
  onHover: (index: number) => void;
}) {
  return (
    <ul
      id={id}
      role="listbox"
      className={LIST}
    >
      {options.map((option, index) => (
        <li
          key={option}
          id={`${id}-${index}`}
          role="option"
          aria-selected={index === active}
          // mousedown, not click: a click lands after the field's blur has
          // already closed the list.
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(option);
          }}
          onMouseMove={() => onHover(index)}
          className={`cursor-pointer truncate px-2.5 py-1.5 ${index === active ? 'bg-white/8 text-bone' : 'text-[#d0d0d4]'}`}
        >
          {option}
        </li>
      ))}
    </ul>
  );
}

/** Arrow keys, Enter and Escape for a field with a Suggestions list under it. */
function useListKeys(count: number) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  /** True when the key was the list's; the field handles the rest. */
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>, onPick: (index: number) => void): boolean {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (!count) return true;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + step + count) % count);
      return true;
    }
    if (event.key === 'Enter' && open && active >= 0 && active < count) {
      event.preventDefault();
      onPick(active);
      return true;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      return true;
    }
    return false;
  }

  return { open, setOpen, active, setActive, onKeyDown };
}

/** One value, typed or picked; picking replaces what is there. */
export function SuggestField({
  value,
  onChange,
  options,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  label: string;
  /** The field's own look — border colour included, which is how a wanted field is marked. */
  className: string;
}) {
  const id = useId();
  // The exact value is left out: a list offering back what is already typed
  // is noise, and would keep the list open after a pick.
  const shown = matches(options, value, (option) => option === value);
  const keys = useListKeys(shown.length);
  const expanded = keys.open && shown.length > 0;

  function pick(option: string) {
    onChange(option);
    keys.setOpen(false);
    keys.setActive(-1);
  }

  return (
    <div className="relative min-w-0">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={expanded && keys.active >= 0 ? `${id}-${keys.active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          keys.setOpen(true);
          keys.setActive(-1);
        }}
        onFocus={() => keys.setOpen(true)}
        onBlur={() => keys.setOpen(false)}
        onKeyDown={(event) => keys.onKeyDown(event, (index) => pick(shown[index]))}
        className={className}
      />
      {expanded ? (
        <Suggestions id={id} options={shown} active={keys.active} onPick={pick} onHover={keys.setActive} />
      ) : null}
    </div>
  );
}

/**
 * Tags as pills inside the field, as TagInput draws them on the edit forms:
 * Enter or a comma turns what was typed into a pill, Backspace on an empty
 * field takes the last one off, and leaving the field keeps what was typed
 * rather than dropping it. The value stays the comma string the actions take.
 */
export function TagField({
  value,
  onChange,
  options,
  label,
  placeholder = 'Add tags',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label: string;
  placeholder?: string;
  className: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const selected = parseTagNames(value);
  const shown = matches(options, draft, (option) => selected.includes(option));
  const keys = useListKeys(shown.length);
  const expanded = keys.open && shown.length > 0;

  // Through parse, which lowercases and dedupes, so the pills and the stored
  // string can never disagree.
  const emit = (names: string[]) => onChange(formatTagNames(parseTagNames(names.join(','))));

  function add(text: string) {
    const typed = parseTagNames(text);
    if (typed.length) emit([...selected, ...typed]);
    setDraft('');
    keys.setActive(-1);
  }

  return (
    <div className="relative min-w-0">
      <div
        // A click anywhere in the box, between pills included, lands in the field.
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            input.current?.focus();
          }
        }}
        className={`${className} flex h-auto min-h-9 cursor-text flex-wrap items-center gap-1 py-1 focus-within:border-gold`}
      >
        {selected.map((name) => (
          <span
            key={name}
            className="flex h-6 items-center gap-1 rounded border border-gold bg-gold/10 pr-1 pl-2 text-xs text-gold"
          >
            {name}
            <button
              type="button"
              onClick={() => emit(selected.filter((other) => other !== name))}
              aria-label={`Remove ${name}`}
              className="flex size-4 items-center justify-center rounded-sm hover:bg-gold/20"
            >
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-expanded={expanded}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={expanded && keys.active >= 0 ? `${id}-${keys.active}` : undefined}
          autoComplete="off"
          value={draft}
          placeholder={selected.length ? '' : placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
            keys.setOpen(true);
            keys.setActive(-1);
          }}
          onFocus={() => keys.setOpen(true)}
          onBlur={() => {
            keys.setOpen(false);
            add(draft);
          }}
          onKeyDown={(event) => {
            if (keys.onKeyDown(event, (index) => add(shown[index]))) return;
            if (event.key === 'Enter' || event.key === ',') {
              // Enter would otherwise submit the bulk bar, and a comma would
              // only sit in the draft where no pill can see it.
              event.preventDefault();
              add(draft);
            } else if (event.key === 'Backspace' && !draft && selected.length) {
              emit(selected.slice(0, -1));
            }
          }}
          className="h-7 min-w-16 flex-1 bg-transparent text-sm text-bone outline-none placeholder:text-ash/80"
        />
      </div>
      {expanded ? <Suggestions id={id} options={shown} active={keys.active} onPick={add} onHover={keys.setActive} /> : null}
    </div>
  );
}

/**
 * A styled stand-in for <select>, for the same reason as the fields above: the
 * native menu is drawn by the operating system and ignores this page. A button
 * that opens a listbox; arrows, Home/End, Enter or Space, and Escape work as
 * they do on the real thing, and typing a letter jumps to the next option
 * starting with it.
 */
export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Shown while nothing is chosen. Not an option: the native "pick one" row only invited choosing nothing. */
  placeholder: string;
  label: string;
  className: string;
}) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const chosen = options.find((option) => option.value === value);

  function show() {
    setOpen(true);
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
  }

  function pick(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  }

  function move(index: number) {
    setActive(index);
    list.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    const last = options.length - 1;
    if (event.key === 'ArrowDown') move(Math.min(last, active + 1));
    else if (event.key === 'ArrowUp') move(Math.max(0, active - 1));
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(last);
    else if (event.key === 'Enter' || event.key === ' ') pick(active);
    else if (event.key === 'Escape' || event.key === 'Tab') {
      // Tab closes and moves on, as a native select does; only Escape stays.
      if (event.key === 'Tab') return setOpen(false);
      setOpen(false);
    } else if (event.key.length === 1) {
      const letter = event.key.toLowerCase();
      const after = [...options.slice(active + 1), ...options.slice(0, active + 1)];
      const hit = after.find((option) => option.label.toLowerCase().startsWith(letter));
      if (hit) move(options.indexOf(hit));
      return;
    } else return;
    event.preventDefault();
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${chosen ? '' : 'text-ash/80'}`}>{chosen?.label ?? placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={`shrink-0 text-ash transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul ref={list} id={id} role="listbox" aria-label={label} className={LIST}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(index);
              }}
              onMouseMove={() => setActive(index)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-2.5 py-1.5 ${index === active ? 'bg-white/8 text-bone' : 'text-[#d0d0d4]'}`}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-gold">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
