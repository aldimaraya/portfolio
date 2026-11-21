import { isRichTextEmpty, type Block, type BlockOf } from './content';

/**
 * Sections are how a post is divided. Each has two names doing different jobs:
 * a short one in the margin ("Food"), which is also how the "In this post"
 * index lists it, and a heading that makes the section's point ("Hong Kong
 * cuisine is seriously good."). Both are derived here once from the block order.
 *
 * Sections used to be numbered days of a trip; posts are not written in order
 * any more, so nothing here counts them.
 */

export type SectionBlock = BlockOf<'section'>;

export interface SectionEntry {
  id: string;
  /** The fragment a link to the section uses, without the `#`. */
  anchor: string;
  /** The short name the margin and the index show; empty until it is given one. */
  label: string;
  title: string;
}

export function sectionAnchor(id: string): string {
  return `section-${id}`;
}

/** Every section in reading order. */
export function sectionEntries(blocks: Block[]): SectionEntry[] {
  return blocks.flatMap((block) =>
    block.type === 'section'
      ? [{ id: block.id, anchor: sectionAnchor(block.id), label: block.label.trim(), title: block.title.trim() }]
      : [],
  );
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
  /**
   * False for a section with neither a label nor a title: it is still being
   * written and has nothing to link by, so the index does not show it. It is
   * still returned so the rail can tell when it is being read — otherwise the
   * section above would stay marked through it.
   */
  listed: boolean;
}

/** A heading as an index row, or null if it has no words to name it by yet. */
function headingEntry(block: Block): SubsectionEntry | null {
  if (block.type !== 'heading') return null;
  const title = block.text.trim();
  return title ? { id: block.id, anchor: sectionAnchor(block.id), title } : null;
}

/**
 * Each section's headings, keyed by section id, up to the next section. A
 * heading before the first section belongs to none and is left out — it has no
 * row to sit under, and promoting it to a row of its own would make it look
 * like a section.
 */
export function subsectionsBySection(blocks: Block[]): Map<string, SubsectionEntry[]> {
  const bySection = new Map<string, SubsectionEntry[]>();
  let current: SubsectionEntry[] | null = null;

  for (const block of blocks) {
    if (block.type === 'section') {
      current = [];
      bySection.set(block.id, current);
      continue;
    }
    const heading = current && headingEntry(block);
    if (heading) current!.push(heading);
  }

  return bySection;
}

/**
 * What the "In this post" index lists: the sections with their subsections, or
 * — in a post that has no listed sections, which is every post written before
 * sections existed — its headings, flat. An unlisted section takes its
 * subsections with it: shown alone they would read as belonging to the section
 * above. `subsections` is subsectionsBySection(blocks), for a caller that
 * already has it.
 */
export function indexEntries(blocks: Block[], subsections = subsectionsBySection(blocks)): IndexEntry[] {
  const sections = sectionEntries(blocks).map((entry) => {
    const listed = Boolean(entry.label || entry.title);
    return { ...entry, listed, subsections: listed ? (subsections.get(entry.id) ?? []) : [] };
  });
  if (sections.some((entry) => entry.listed)) return sections;

  return blocks.flatMap((block) => {
    const heading = headingEntry(block);
    return heading
      ? [{ ...heading, label: '', subsections: [], listed: true }]
      : [];
  });
}

/**
 * Where the selected block sits: the section holding it, and the listed heading
 * over it within that section — walking back, the first one met before the
 * section. A subsection outside any section is not one, so it is null there,
 * as it is in a section's lead-in above its first heading.
 */
export function enclosing(
  blocks: Block[],
  selected: string | null,
): { section: string | null; subsection: string | null } {
  let subsection: string | null = null;
  for (let i = blocks.findIndex((block) => block.id === selected); i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.type === 'section') return { section: block.id, subsection };
    if (subsection === null && headingEntry(block)) subsection = block.id;
  }
  return { section: null, subsection: null };
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
