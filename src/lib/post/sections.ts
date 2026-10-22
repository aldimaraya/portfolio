import type { Block, BlockOf } from './content';

/**
 * Sections are how a post is divided: a day of a trip, or something named like
 * "Packing". Their labels sit in the sheet's margin and their list is the post's
 * "In this post" index, so the two are derived here once from the block order.
 */

export type SectionBlock = BlockOf<'section'>;

export interface SectionEntry {
  id: string;
  /** The fragment a link to the section uses, without the `#`. */
  anchor: string;
  /** What the margin and the index show: the override, or "Day N", or nothing. */
  label: string;
  /** The day number a numbered section holds, renamed or not. */
  day: number | null;
  title: string;
  date: string;
  place: string;
}

export function sectionAnchor(id: string): string {
  return `section-${id}`;
}

/**
 * Every section in reading order, labelled. Days are numbered by position, so
 * moving one renumbers the rest — but a renamed day still holds its number, so
 * calling Day 1 "Arrival" does not turn Day 2 into Day 1.
 */
export function sectionEntries(blocks: Block[]): SectionEntry[] {
  let day = 0;
  const entries: SectionEntry[] = [];

  for (const block of blocks) {
    if (block.type !== 'section') continue;
    const number = block.numbered ? (day += 1) : null;
    entries.push({
      id: block.id,
      anchor: sectionAnchor(block.id),
      label: block.label.trim() || (number !== null ? `Day ${number}` : ''),
      day: number,
      title: block.title.trim(),
      date: block.date.trim(),
      place: block.place.trim(),
    });
  }

  return entries;
}

/** The label a numbered section falls back to when its override is cleared. */
export function defaultLabel(entry: Pick<SectionEntry, 'day'>): string {
  return entry.day !== null ? `Day ${entry.day}` : '';
}

/**
 * What the "In this post" index lists: the sections, or — in a post that has
 * none, which is every post written before sections existed — its headings. A
 * section with neither a label nor a title is still being written and has
 * nothing to link by, so it is left out.
 */
export function indexEntries(blocks: Block[]): SectionEntry[] {
  const sections = sectionEntries(blocks).filter((entry) => entry.label || entry.title);
  if (sections.length) return sections;

  return blocks.flatMap((block) =>
    block.type === 'heading' && block.text.trim()
      ? [{ id: block.id, anchor: sectionAnchor(block.id), label: '', day: null, title: block.text.trim(), date: '', place: '' }]
      : [],
  );
}
