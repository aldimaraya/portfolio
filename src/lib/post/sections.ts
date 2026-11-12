import { isRichTextEmpty, type Block, type BlockOf } from './content';

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
 * A heading under a section: a subsection, listed beneath its section in the
 * index and the editor's outline. Headings already carry a section-style anchor
 * (PostBlock's blockAnchor), so linking to one needs nothing new on the page.
 */
export interface SubsectionEntry {
  id: string;
  anchor: string;
  title: string;
}

export interface IndexEntry extends SectionEntry {
  subsections: SubsectionEntry[];
}

/**
 * Each section's headings, keyed by section id, up to the next section. A
 * heading before the first section belongs to none and is left out — it has no
 * row to sit under, and promoting it to a row of its own would make it look
 * like a section. An empty heading is still being written and has no name to
 * list.
 */
export function subsectionsBySection(blocks: Block[]): Map<string, SubsectionEntry[]> {
  const bySection = new Map<string, SubsectionEntry[]>();
  let current: SubsectionEntry[] | null = null;

  for (const block of blocks) {
    if (block.type === 'section') {
      current = [];
      bySection.set(block.id, current);
    } else if (block.type === 'heading' && current && block.text.trim()) {
      current.push({ id: block.id, anchor: sectionAnchor(block.id), title: block.text.trim() });
    }
  }

  return bySection;
}

/**
 * What the "In this post" index lists: the sections with their subsections, or
 * — in a post that has no sections, which is every post written before sections
 * existed — its headings, flat. A section with neither a label nor a title is
 * still being written and has nothing to link by, so it is left out, and its
 * subsections with it: listed alone they would read as belonging to the section
 * above.
 */
export function indexEntries(blocks: Block[]): IndexEntry[] {
  const subsections = subsectionsBySection(blocks);
  const sections = sectionEntries(blocks)
    .filter((entry) => entry.label || entry.title)
    .map((entry) => ({ ...entry, subsections: subsections.get(entry.id) ?? [] }));
  if (sections.length) return sections;

  return blocks.flatMap((block) =>
    block.type === 'heading' && block.text.trim()
      ? [
          {
            id: block.id,
            anchor: sectionAnchor(block.id),
            label: '',
            day: null,
            title: block.text.trim(),
            date: '',
            place: '',
            subsections: [],
          },
        ]
      : [],
  );
}

/**
 * The heading that the selected block sits under, within its section: walking
 * back from the selection, the first heading met before a section. Null when
 * the selection is in a section's lead-in, above any of its headings.
 */
export function enclosingSubsection(blocks: Block[], selected: string | null): string | null {
  const at = blocks.findIndex((block) => block.id === selected);
  for (let i = at; i >= 0; i -= 1) {
    if (blocks[i].type === 'section') return null;
    if (blocks[i].type === 'heading') return blocks[i].id;
  }
  return null;
}

/**
 * Ids of the sections with no words under them before the next section starts:
 * the editor's outline marks them, the admin list warns about them. A section's
 * own title does not count — it heads the writing, it is not the writing.
 * Blocks before the first section belong to none.
 */
export function unwrittenSections(blocks: Block[]): string[] {
  const unwritten: string[] = [];
  let current: string | null = null;
  let written = false;

  for (const block of blocks) {
    if (block.type === 'section') {
      if (current !== null && !written) unwritten.push(current);
      current = block.id;
      written = false;
    } else if (hasWords(block)) {
      written = true;
    }
  }
  if (current !== null && !written) unwritten.push(current);
  return unwritten;
}

function hasWords(block: Block): boolean {
  switch (block.type) {
    case 'text':
      return !isRichTextEmpty(block.body);
    case 'tip':
      return !isRichTextEmpty(block.body) || block.title.trim() !== '';
    case 'heading':
    case 'quote':
      return block.text.trim() !== '';
    case 'list':
      return block.groups.some((group) => group.items.some((item) => item.name.trim() !== ''));
    default:
      return false;
  }
}
