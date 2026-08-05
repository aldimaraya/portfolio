import { describe, expect, it } from 'vitest';
import {
  insertBlock,
  insertLink,
  toggleLinePrefix,
  toggleWrap,
} from '@/lib/markdown/toolbar';

/** Marks a selection in a fixture so the cases read as what the user selected. */
function select(marked: string) {
  const start = marked.indexOf('|');
  const end = marked.indexOf('|', start + 1) - 1;
  return { value: marked.replace(/\|/g, ''), start, end };
}

/** A collapsed caret — no selection at all, which is the common case in use. */
function caret(marked: string) {
  const at = marked.indexOf('|');
  return { value: marked.replace('|', ''), start: at, end: at };
}

describe('toggleWrap', () => {
  it('wraps the selection and keeps it selected inside the markers', () => {
    const edit = toggleWrap(select('the |light| was thin'), '**');
    expect(edit.value).toBe('the **light** was thin');
    expect(edit.value.slice(edit.start, edit.end)).toBe('light');
  });

  it('unwraps when the markers are inside the selection', () => {
    const edit = toggleWrap(select('the |**light**| was thin'), '**');
    expect(edit.value).toBe('the light was thin');
    expect(edit.value.slice(edit.start, edit.end)).toBe('light');
  });

  it('unwraps when the markers sit outside the selection', () => {
    // What a double-click on the word gives — the same intent as the case above.
    const edit = toggleWrap(select('the **|light|** was thin'), '**');
    expect(edit.value).toBe('the light was thin');
  });

  it('expands an empty selection to the word under the caret', () => {
    const edit = toggleWrap(select('the li||ght was thin'), '**');
    expect(edit.value).toBe('the **light** was thin');
  });

  it('leaves a marker pair with nothing between it when there is no word to take', () => {
    const edit = toggleWrap(select('the || gap'), '*');
    expect(edit.value).toBe('the ** gap');
    expect(edit.start).toBe(edit.end);
  });

  it('handles single-character markers without mistaking one for a pair', () => {
    const edit = toggleWrap(select('|code|'), '`');
    expect(edit.value).toBe('`code`');
  });
});

describe('toggleLinePrefix', () => {
  it('prefixes every line the selection touches', () => {
    const edit = toggleLinePrefix(select('o|ne\ntw|o\nthree'), '- ');
    expect(edit.value).toBe('- one\n- two\nthree');
  });

  it('replaces a competing heading level rather than stacking', () => {
    const edit = toggleLinePrefix(select('# On|e'), '## ');
    expect(edit.value).toBe('## One');
  });

  it('removes the prefix when every line already has it', () => {
    const edit = toggleLinePrefix(select('|- one\n- two|'), '- ');
    expect(edit.value).toBe('one\ntwo');
  });

  it('applies rather than removes when only some lines have it', () => {
    const edit = toggleLinePrefix(select('|- one\ntwo|'), '- ');
    expect(edit.value).toBe('- one\n- two');
  });

  it('numbers an ordered list across the block', () => {
    const edit = toggleLinePrefix(select('|one\ntwo\nthree|'), '1. ');
    expect(edit.value).toBe('1. one\n2. two\n3. three');
  });

  it('toggles an already numbered list off whatever its numbers are', () => {
    const edit = toggleLinePrefix(select('|1. one\n2. two|'), '1. ');
    expect(edit.value).toBe('one\ntwo');
  });

  it('converts between list kinds', () => {
    const edit = toggleLinePrefix(select('|- one\n- two|'), '1. ');
    expect(edit.value).toBe('1. one\n2. two');
  });

  it('leaves blank lines alone', () => {
    const edit = toggleLinePrefix(select('|one\n\ntwo|'), '> ');
    expect(edit.value).toBe('> one\n\n> two');
  });

  it('selects the rewritten block so a second click can toggle it back', () => {
    const edit = toggleLinePrefix(select('|one\ntwo|'), '- ');
    expect(edit.value.slice(edit.start, edit.end)).toBe('- one\n- two');
  });

  it('starts a heading on an empty line, with the caret ready to type after it', () => {
    const edit = toggleLinePrefix(caret('|'), '# ');
    expect(edit.value).toBe('# ');
    expect(edit.start).toBe(2);
    expect(edit.end).toBe(2);
  });

  it('starts a heading on an empty line between paragraphs', () => {
    const edit = toggleLinePrefix(caret('one\n|\ntwo'), '## ');
    expect(edit.value).toBe('one\n## \ntwo');
    expect(edit.start).toBe(7);
  });

  it('toggles an empty heading back off', () => {
    const edit = toggleLinePrefix(caret('# |'), '# ');
    expect(edit.value).toBe('');
    expect(edit.start).toBe(0);
  });

  it('keeps a collapsed caret on its word rather than selecting the line', () => {
    const edit = toggleLinePrefix(caret('on|e'), '# ');
    expect(edit.value).toBe('# one');
    expect(edit.start).toBe(4);
    expect(edit.end).toBe(4);
  });

  it('keeps the caret in place when swapping heading levels', () => {
    const edit = toggleLinePrefix(caret('# on|e'), '## ');
    expect(edit.value).toBe('## one');
    expect(edit.start).toBe(5);
  });

  it('keeps the caret in place when removing a prefix', () => {
    const edit = toggleLinePrefix(caret('- on|e'), '- ');
    expect(edit.value).toBe('one');
    expect(edit.start).toBe(2);
  });

  it('still skips blank lines inside a multi-line block', () => {
    const edit = toggleLinePrefix(select('|one\n\ntwo|'), '- ');
    expect(edit.value).toBe('- one\n\n- two');
  });
});

describe('insertLink', () => {
  it('uses the selection as the link text and selects it', () => {
    const edit = insertLink(select('read |this| now'), 'https://example.com');
    expect(edit.value).toBe('read [this](https://example.com) now');
    expect(edit.value.slice(edit.start, edit.end)).toBe('this');
  });

  it('falls back to the URL as its own text when nothing is selected', () => {
    const edit = insertLink(select('||'), 'https://example.com');
    expect(edit.value).toBe('[https://example.com](https://example.com)');
  });
});

describe('insertBlock', () => {
  it('separates the block from surrounding prose with blank lines', () => {
    const edit = insertBlock(select('before||after'), '![](x.webp)');
    expect(edit.value).toBe('before\n\n![](x.webp)\n\nafter');
  });

  it('does not pile up blank lines that are already there', () => {
    const edit = insertBlock(select('before\n\n||\n\nafter'), 'X');
    expect(edit.value).toBe('before\n\nX\n\nafter');
  });

  it('adds nothing at the very start or end of an empty document', () => {
    const edit = insertBlock(select('||'), 'X');
    expect(edit.value).toBe('X');
  });

  it('leaves the caret after the inserted block', () => {
    const edit = insertBlock(select('before||after'), 'X');
    expect(edit.start).toBe(edit.end);
    expect(edit.value.slice(edit.start)).toBe('\n\nafter');
  });

  it('replaces the selection it is given', () => {
    const edit = insertBlock(select('a |b| c'), 'X');
    expect(edit.value).toBe('a \n\nX\n\n c');
  });
});
