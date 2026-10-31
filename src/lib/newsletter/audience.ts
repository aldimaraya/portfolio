import { contentFor, isEmpty, type DigestContent } from './digest';
import { CONTENT_KINDS, KIND_LABELS, type ContentKind, type Preferences } from './kinds';

/**
 * Who a batch reaches, split by what people chose. Subscribers only differ in
 * their three ticks, so there are at most seven distinct emails per dispatch —
 * the admin previews each of those rather than one per person.
 */

export interface PreferenceGroup {
  /** "stills+journal" — stable across renders, for keys and the switcher. */
  key: string;
  label: string;
  prefs: Preferences;
  /** Confirmed subscribers with exactly these choices. */
  count: number;
}

/**
 * A fixed order for the labels and keys, so one set of choices always reads
 * and keys the same. Not the email's order: that is NewsletterDraft.sections,
 * and changes when the admin drags a section.
 */
const LABEL_ORDER: ContentKind[] = ['stills', 'motion', 'journal'];

function groupKey(prefs: Preferences): string {
  return LABEL_ORDER.filter((kind) => prefs[kind]).join('+');
}

export function groupLabel(prefs: Preferences): string {
  const kinds = LABEL_ORDER.filter((kind) => prefs[kind]);
  if (kinds.length === CONTENT_KINDS.length) return 'Everything';
  if (kinds.length === 1) return `${KIND_LABELS[kinds[0]].label} only`;
  return kinds.map((kind) => KIND_LABELS[kind].label).join(' + ');
}

/**
 * Subscribers folded into their distinct choices, Everything first — it is the
 * default preview even when nobody holds it, since it shows every item — then
 * the rest by how many hold them.
 */
export function preferenceGroups(subscribers: Preferences[]): PreferenceGroup[] {
  const groups = new Map<string, PreferenceGroup>();
  const everything: Preferences = { journal: true, motion: true, stills: true };
  groups.set(groupKey(everything), { key: groupKey(everything), label: 'Everything', prefs: everything, count: 0 });

  for (const subscriber of subscribers) {
    const prefs = { journal: subscriber.journal, motion: subscriber.motion, stills: subscriber.stills };
    const key = groupKey(prefs);
    // A row with nothing ticked cannot be saved (preferencesSchema), but one
    // would get no email anyway, so it is simply not a group.
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { key, label: groupLabel(prefs), prefs, count: 1 });
  }

  const [first, ...rest] = groups.values();
  return [first, ...rest.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))];
}

/** How many of these subscribers the batch would actually email. */
export function reach(content: DigestContent, groups: PreferenceGroup[]): number {
  return groups.reduce((total, group) => total + (isEmpty(contentFor(content, group.prefs)) ? 0 : group.count), 0);
}
