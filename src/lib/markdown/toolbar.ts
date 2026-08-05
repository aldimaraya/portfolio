/**
 * Selection maths for the journal editor's formatting toolbar.
 *
 * Every function is a pure text transform: it takes the textarea's value and
 * selection and returns the replacement value plus where the caret should end
 * up. The component does nothing but hand these its DOM state and put the
 * result back, which is what keeps the fiddly part — where the caret lands
 * after a toggle, what "already bold" means — testable without a DOM.
 *
 * The stored format stays Markdown. The toolbar exists so nobody has to
 * remember the syntax, not so the syntax goes away.
 */

export interface Selection {
  value: string;
  start: number;
  end: number;
}

export interface Edit {
  value: string;
  /** Where the selection should be restored to, so the caret follows the edit. */
  start: number;
  end: number;
}

/** Line prefixes the toolbar can apply. `1. ` is renumbered, not repeated. */
export const HEADING_PREFIXES = ['# ', '## ', '### '] as const;
const ORDERED = '1. ';

/** Prefixes that replace each other rather than stacking. */
const BLOCK_FAMILIES: string[][] = [[...HEADING_PREFIXES], ['> '], ['- ', ORDERED]];

function familyOf(prefix: string): string[] {
  return BLOCK_FAMILIES.find((family) => family.includes(prefix)) ?? [prefix];
}

/**
 * The existing prefix on a line, from the same family as `prefix`. Ordered items
 * match any number, not just `1.`, so toggling off a renumbered list works on
 * every line of it.
 */
function currentPrefix(line: string, family: string[]): string | null {
  for (const candidate of family) {
    if (candidate === ORDERED) {
      const match = /^\d+\.\s/.exec(line);
      if (match) return match[0];
    } else if (line.startsWith(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Word characters for the purpose of expanding an empty selection. */
const WORD = /[\p{L}\p{N}_]/u;

/**
 * Grows an empty selection to the word under the caret. Clicking **bold** with
 * nothing selected almost always means "bold this word"; inserting a bare `****`
 * and leaving the caret inside is technically correct and never what was wanted.
 */
function expandToWord(sel: Selection): Selection {
  if (sel.start !== sel.end) return sel;

  let start = sel.start;
  let end = sel.end;
  while (start > 0 && WORD.test(sel.value[start - 1])) start -= 1;
  while (end < sel.value.length && WORD.test(sel.value[end])) end += 1;
  return { ...sel, start, end };
}

function splice(value: string, start: number, end: number, replacement: string): string {
  return value.slice(0, start) + replacement + value.slice(end);
}

/**
 * Wraps or unwraps the selection in `marker` (`**`, `*`, `` ` ``).
 *
 * Unwrapping looks both inside and outside the selection: selecting the word in
 * `**bold**` by double-clicking gives a selection with the markers outside it,
 * and selecting the whole run by dragging puts them inside. Both are the same
 * intent, and a toggle that only handled one would silently double up the
 * markers half the time.
 */
export function toggleWrap(sel: Selection, marker: string): Edit {
  const { value, start, end } = expandToWord(sel);
  const selected = value.slice(start, end);
  const len = marker.length;

  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= len * 2) {
    const stripped = selected.slice(len, -len);
    return { value: splice(value, start, end, stripped), start, end: start + stripped.length };
  }

  const before = value.slice(Math.max(0, start - len), start);
  const after = value.slice(end, end + len);
  if (before === marker && after === marker) {
    return {
      value: splice(value, start - len, end + len, selected),
      start: start - len,
      end: start - len + selected.length,
    };
  }

  const wrapped = `${marker}${selected}${marker}`;
  return { value: splice(value, start, end, wrapped), start: start + len, end: start + len + selected.length };
}

/** Start and end offsets of every line the selection touches. */
function selectedLines(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end);
  return { from, to: lineEnd === -1 ? value.length : lineEnd };
}

/**
 * Applies `prefix` to every line the selection touches, replacing any competing
 * prefix from the same family — `## ` over `# ` gives `## `, not `# ## `. Applying
 * the prefix a line already has removes it, so each button is its own undo.
 *
 * Ordered lists are renumbered from 1 across the block; a selection of three
 * lines becomes 1. 2. 3. rather than three 1.s.
 */
export function toggleLinePrefix(sel: Selection, prefix: string): Edit {
  const { value, start, end } = sel;
  const { from, to } = selectedLines(value, start, end);
  const family = familyOf(prefix);

  const lines = value.slice(from, to).split('\n');
  // Blank lines are skipped, so prefixing a paragraph that ends in a newline
  // does not leave a bare "- " behind on the empty line. That only holds for a
  // block of several lines: clicking H1 with the caret on its own empty line is
  // the opposite intent — "start a heading here" — and skipping it made the
  // button do nothing at all, so a heading could only be made by typing the text
  // first and selecting it.
  const single = lines.length === 1;
  const affects = (line: string) => single || Boolean(line.trim());

  const meaningful = lines.filter(affects);
  const removing =
    meaningful.length > 0 &&
    meaningful.every((line) => {
      const existing = currentPrefix(line, family);
      return existing !== null && (prefix === ORDERED ? /^\d+\.\s/.test(existing) : existing === prefix);
    });

  let counter = 1;
  const rewritten = lines.map((line) => {
    if (!affects(line)) return line;
    const existing = currentPrefix(line, family);
    const bare = existing ? line.slice(existing.length) : line;
    if (removing) return bare;
    const applied = prefix === ORDERED ? `${counter++}. ` : prefix;
    return `${applied}${bare}`;
  });

  const replacement = rewritten.join('\n');
  const edited = splice(value, from, to, replacement);

  // A collapsed caret keeps its place in the text rather than being handed back a
  // selection of the whole line: selecting it means the next keystroke wipes the
  // line that was just formatted, which is exactly what typing after clicking H1
  // is meant to do.
  if (start === end) {
    const caret = shiftCaret(lines, rewritten, from, start);
    return { value: edited, start: caret, end: caret };
  }

  return { value: edited, start: from, end: from + replacement.length };
}

/**
 * Maps an offset in the original block to the same spot in the rewritten one,
 * moving with the prefix that was added to or removed from its own line and
 * clamping into that line so a removal cannot push the caret off the front.
 */
function shiftCaret(
  lines: string[],
  rewritten: string[],
  blockStart: number,
  caret: number,
): number {
  let originalLineStart = blockStart;
  let newLineStart = blockStart;

  for (const [index, line] of lines.entries()) {
    const isLast = index === lines.length - 1;
    // +1 for the newline joining this line to the next.
    if (isLast || caret <= originalLineStart + line.length) {
      const column = caret - originalLineStart;
      const delta = rewritten[index].length - line.length;
      const shifted = Math.min(Math.max(column + delta, 0), rewritten[index].length);
      return newLineStart + shifted;
    }
    originalLineStart += line.length + 1;
    newLineStart += rewritten[index].length + 1;
  }

  return newLineStart;
}

/**
 * Turns the selection into a link. With nothing selected the URL doubles as the
 * text, and the caret lands on the text so it can be typed over immediately.
 */
export function insertLink(sel: Selection, url: string, text?: string): Edit {
  const { value, start, end } = sel;
  const selected = value.slice(start, end);
  const label = text ?? (selected || url);
  const snippet = `[${label}](${url})`;
  return { value: splice(value, start, end, snippet), start: start + 1, end: start + 1 + label.length };
}

/**
 * Drops a block (media, a rule, a code fence) on its own line, with a blank line
 * either side. Markdown needs the separation for the block to be a block at all,
 * and inserting mid-paragraph without it silently produces inline content.
 */
export function insertBlock(sel: Selection, snippet: string): Edit {
  const { value, start, end } = sel;
  const before = value.slice(0, start);
  const after = value.slice(end);

  const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';

  const inserted = `${lead}${snippet}${trail}`;
  const caret = start + lead.length + snippet.length;
  return { value: splice(value, start, end, inserted), start: caret, end: caret };
}
