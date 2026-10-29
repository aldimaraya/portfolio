import { NEWSLETTER_NAME, SITE_NAME } from '@/lib/site';
import { formatTakenAt } from '@/lib/photo/date';
import { justifyRows } from '@/lib/photo/justify';
import { OPEN_PHOTO_PARAM } from '@/lib/photo/lightbox-link';
import { chosenKinds, KIND_LABELS, type ContentKind, type Preferences } from './kinds';

/**
 * The emails themselves, as plain strings. Pure — no database, no env — so the
 * admin can render the exact digest a subscriber would get as a preview, and
 * the tests can pin the markup without a provider in the loop.
 *
 * Every value that came from the database goes through `escapeHtml`: titles and
 * locations are typed into the admin, and an email client is a renderer too.
 */

export interface DigestPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
}

export interface DigestClip {
  id: string;
  title: string;
  description: string;
  posterImageUrl: string;
}

export interface DigestPhoto {
  id: string;
  imageUrl: string;
  title: string;
  location: string;
  /** Stored pixel size — only the ratio matters, for the justified rows. */
  width: number;
  height: number;
  /** Null for the photos whose capture date was never known — see Photo.takenAt. */
  takenAt: Date | null;
}

export interface DigestContent {
  journal: DigestPost[];
  motion: DigestClip[];
  stills: DigestPhoto[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Thumbnails shown for a batch of photos; the rest are counted, not shown. */
export const MAX_PHOTO_THUMBNAILS = 6;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The batch narrowed to what one subscriber asked for. */
export function contentFor(content: DigestContent, prefs: Preferences): DigestContent {
  return {
    journal: prefs.journal ? content.journal : [],
    motion: prefs.motion ? content.motion : [],
    stills: prefs.stills ? content.stills : [],
  };
}

export function isEmpty(content: DigestContent): boolean {
  return !content.journal.length && !content.motion.length && !content.stills.length;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Specific when the batch is one thing — the title is the most persuasive word
 * available — and a count of each when it is a mix.
 */
export function digestSubject(content: DigestContent): string {
  const { journal, motion, stills } = content;
  const kinds = [journal, motion, stills].filter((items) => items.length > 0).length;

  if (kinds === 1) {
    if (journal.length === 1) return `New in the journal: ${journal[0].title}`;
    if (journal.length) return `${journal.length} new journal posts`;
    if (motion.length === 1) return `New clip: ${motion[0].title}`;
    if (motion.length) return `${motion.length} new clips`;
    return `${plural(stills.length, 'new photo', 'new photos')} on the wall`;
  }

  const parts = [
    journal.length ? plural(journal.length, 'journal post', 'journal posts') : '',
    motion.length ? plural(motion.length, 'clip', 'clips') : '',
    stills.length ? plural(stills.length, 'photo', 'photos') : '',
  ].filter(Boolean);
  return `New on ${NEWSLETTER_NAME}: ${joinList(parts)}`;
}

/**
 * Photos and posters are stored at full size on R2, and a digest of six of them
 * would be tens of megabytes in someone's inbox. The site's own image optimiser
 * serves a small copy instead. 640 is one of next/image's default widths and 75
 * its default quality — anything off those lists is refused.
 */
export function emailImageUrl(site: string, source: string): string {
  return `${site}/_next/image?url=${encodeURIComponent(source)}&w=640&q=75`;
}

export function photoLink(site: string, id: string): string {
  return `${site}/stills?${OPEN_PHOTO_PARAM}=${encodeURIComponent(id)}`;
}

// Email clients strip <style> blocks unevenly, so everything is inline and laid
// out with tables. The palette is the site's printed-mat pair (globals.css
// --color-mat / --color-matink / --color-matmeta): a dark email is at the mercy
// of each client's dark-mode inversion, a light one mostly is not.
const INK = '#24242a';
const META = '#7a6323';
const PAPER = '#f2efe6';
const RULE = '#dcd6c6';
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

function sectionHeading(label: string): string {
  return `<tr><td style="padding:28px 0 8px;font:600 11px/1.4 ${SANS};letter-spacing:0.18em;text-transform:uppercase;color:${META};border-bottom:1px solid ${RULE};">${escapeHtml(label)}</td></tr>`;
}

function postRows(site: string, posts: DigestPost[]): string {
  return posts
    .map((post) => {
      const href = `${site}/journal/${encodeURIComponent(post.slug)}`;
      return `<tr><td style="padding:16px 0 0;">
  <a href="${escapeHtml(href)}" style="font:600 20px/1.3 ${SERIF};color:${INK};text-decoration:none;">${escapeHtml(post.title)}</a>
  ${post.excerpt ? `<p style="margin:6px 0 0;font:15px/1.55 ${SERIF};color:${INK};">${escapeHtml(post.excerpt)}</p>` : ''}
  <p style="margin:8px 0 0;font:13px/1.4 ${SANS};"><a href="${escapeHtml(href)}" style="color:${META};">Read the post →</a></p>
</td></tr>`;
    })
    .join('\n');
}

function clipRows(site: string, images: string, clips: DigestClip[]): string {
  return clips
    .map((clip) => {
      const href = `${site}/motion/${encodeURIComponent(clip.id)}`;
      return `<tr><td style="padding:16px 0 0;">
  <a href="${escapeHtml(href)}"><img src="${escapeHtml(emailImageUrl(images, clip.posterImageUrl))}" alt="${escapeHtml(clip.title)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;"></a>
  <a href="${escapeHtml(href)}" style="display:block;margin-top:10px;font:600 18px/1.3 ${SANS};color:${INK};text-decoration:none;">${escapeHtml(clip.title)}</a>
  ${clip.description ? `<p style="margin:4px 0 0;font:14px/1.5 ${SANS};color:${INK};">${escapeHtml(clip.description)}</p>` : ''}
</td></tr>`;
    })
    .join('\n');
}

// The email's column, and the space between two photos. Gutters sit only
// *between* tiles, so a row's outer edges line up with the section rule above.
const ROW_WIDTH = 560;
const TILE_GAP = 8;
/** What a row aims for — the wall's rhythm, scaled to a column this narrow. */
export const ROW_TARGET_HEIGHT = 200;
/**
 * How tall a short last row may grow to fill the width. On the wall the last
 * row stays at the target so a lone panorama does not tower over the rows above
 * it; in an email there are only a handful of photos, and a half-empty last row
 * reads as a layout fault. A row that would need to be taller than this to fill
 * the width — one portrait on its own — stops here and is left short: stretched
 * to 560px wide it would be most of a phone screen of one photo.
 */
export const ROW_MAX_HEIGHT = 380;

export interface PhotoTile {
  photo: DigestPhoto;
  /** Image size in px at full column width. */
  width: number;
  height: number;
  /** The tile's share of the row, its gutters included, for a table cell's width. */
  percent: number;
  /** Gutter on each side: none at the row's outer edges. */
  padLeft: number;
  padRight: number;
}

/**
 * The wall's justified rows (lib/photo/justify.ts) laid out for the email:
 * every photo in a row shares one height, widths follow each photo's shape.
 * Computed here rather than in the client, since an email has no script, and
 * emitted as percentages so a narrow phone scales every row evenly.
 */
export function photoRows(photos: DigestPhoto[]): PhotoTile[][] {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const rows = justifyRows(
    photos.map((photo) => ({ id: photo.id, ratio: photo.height > 0 ? photo.width / photo.height : 1 })),
    ROW_WIDTH,
    { targetHeight: ROW_TARGET_HEIGHT, gap: TILE_GAP, padding: 0 },
  );

  const last = rows[rows.length - 1];
  if (last) {
    const available = ROW_WIDTH - (last.length - 1) * TILE_GAP;
    const fitted = available / last.reduce((sum, item) => sum + item.ratio, 0);
    const height = Math.min(fitted, ROW_MAX_HEIGHT);
    rows[rows.length - 1] = last.map((item) => ({
      ...item,
      height,
      width: Math.max(1, Math.floor(item.ratio * height)),
    }));
  }

  return rows.map((row) =>
    row.map((item, index) => {
      const padLeft = index > 0 ? TILE_GAP / 2 : 0;
      const padRight = index < row.length - 1 ? TILE_GAP / 2 : 0;
      return {
        photo: byId.get(item.id)!,
        width: item.width,
        height: Math.round(item.height),
        // Floored to a tenth so a row never sums past 100% and wraps.
        percent: Math.floor(((item.width + padLeft + padRight) / ROW_WIDTH) * 1000) / 10,
        padLeft,
        padRight,
      };
    }),
  );
}

/**
 * The wall's caption order (lib/photo/caption.ts): the title leads when there
 * is one and the location drops beneath it, otherwise the location leads.
 * Camera and exposure settings are left to the site — they crowd a tile a
 * third of an email wide, and the photo link is one click away.
 */
export function photoEmailCaption(photo: DigestPhoto): { heading: string; meta: string } {
  const title = photo.title.trim();
  const meta = [title ? photo.location : '', photo.takenAt ? formatTakenAt(photo.takenAt) : '']
    .filter(Boolean)
    .join(' · ');
  return { heading: title || photo.location, meta };
}

function photoGrid(site: string, images: string, photos: DigestPhoto[]): string {
  const shown = photos.slice(0, MAX_PHOTO_THUMBNAILS);

  // One table per row, so each row sizes its own cells — a shared table would
  // force every row into the first row's column widths.
  const rows = photoRows(shown).map((row) => {
    const cells = row.map(({ photo, width, height, percent, padLeft, padRight }) => {
      const { heading, meta } = photoEmailCaption(photo);
      const href = escapeHtml(photoLink(site, photo.id));
      const alt = photo.title ? `${photo.title}, ${photo.location}` : photo.location;
      // width/height attributes for clients that ignore CSS (desktop Outlook);
      // everyone else scales by the cell's percentage.
      return `<td width="${percent}%" style="padding:0 ${padRight}px 16px ${padLeft}px;vertical-align:top;">
  <a href="${href}"><img src="${escapeHtml(emailImageUrl(images, photo.imageUrl))}" alt="${escapeHtml(alt)}" width="${width}" height="${height}" style="display:block;width:100%;height:auto;border:0;"></a>
  <a href="${href}" style="display:block;margin-top:6px;font:600 13px/1.35 ${SANS};color:${INK};text-decoration:none;">${escapeHtml(heading)}</a>
  ${meta ? `<div style="margin-top:2px;font:12px/1.4 ${SANS};color:${META};">${escapeHtml(meta)}</div>` : ''}
</td>`;
    });
    // A short last row gets an empty cell for the rest of the width: a fixed
    // table would otherwise share the leftover out and stretch the photos.
    const used = row.reduce((sum, tile) => sum + tile.percent, 0);
    if (used < 99) cells.push(`<td width="${Math.round((100 - used) * 10) / 10}%"></td>`);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;"><tr>${cells.join('')}</tr></table>`;
  });

  const more = photos.length - shown.length;
  const link =
    more > 0
      ? `See all ${photos.length} on the wall →`
      : photos.length === 1
        ? 'See it on the wall →'
        : 'See them on the wall →';
  return `<tr><td style="padding:16px 0 0;">
  ${rows.join('\n  ')}
  <p style="margin:4px 0 0;font:13px/1.4 ${SANS};"><a href="${escapeHtml(`${site}/stills`)}" style="color:${META};">${link}</a></p>
</td></tr>`;
}

/** The site's host, shown as a link — written out, Gmail would link it anyway. */
function siteLink(site: string, color: string): string {
  const host = site.replace(/^https?:\/\//, '');
  return `<a href="${escapeHtml(site)}" style="color:${color};">${escapeHtml(host)}</a>`;
}

function footer(manageUrl: string, prefs: Preferences, site: string): string {
  const chosen = chosenKinds(prefs).map((kind) => KIND_LABELS[kind].label);
  return `<tr><td style="padding:36px 0 0;font:12px/1.6 ${SANS};color:#6b6b72;border-top:1px solid ${RULE};">
  You're getting this because you subscribed to ${escapeHtml(joinList(chosen))} updates on ${escapeHtml(NEWSLETTER_NAME)} (${siteLink(site, '#6b6b72')}).
  One email when something new goes up, never more than that.<br>
  <a href="${escapeHtml(manageUrl)}" style="color:#6b6b72;">Change what you get, or unsubscribe</a>
</td></tr>`;
}

function shell(title: string, preheader: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;color:${INK};">
<tr><td style="font:600 13px/1.4 ${SANS};letter-spacing:0.2em;text-transform:uppercase;color:${INK};">${escapeHtml(SITE_NAME)}</td></tr>
${body}
</table>
</td></tr>
</table>
</body>
</html>`;
}

const SECTION_LABELS: Record<ContentKind, string> = {
  journal: 'Journal',
  motion: 'Motion',
  stills: 'Stills',
};

export interface DigestLinks {
  /** Where links point, no trailing slash — lib/newsletter/origin.ts. */
  site: string;
  /**
   * Where images are fetched from, when that differs from `site`: outside
   * production links point at the local server, which a mail provider's image
   * proxy cannot reach. Defaults to `site`.
   */
  images?: string;
  /** This subscriber's manage page. */
  manage: string;
}

/** One subscriber's digest. `content` must already be narrowed by `contentFor`. */
export function renderDigest(
  content: DigestContent,
  prefs: Preferences,
  links: DigestLinks,
): RenderedEmail {
  const subject = digestSubject(content);
  const { site, manage } = links;
  const images = links.images ?? site;

  const sections: string[] = [];
  const text: string[] = [subject, ''];

  if (content.journal.length) {
    sections.push(sectionHeading(SECTION_LABELS.journal), postRows(site, content.journal));
    text.push(SECTION_LABELS.journal.toUpperCase());
    for (const post of content.journal) {
      text.push(`${post.title}`, post.excerpt, `${site}/journal/${post.slug}`, '');
    }
  }
  if (content.motion.length) {
    sections.push(sectionHeading(SECTION_LABELS.motion), clipRows(site, images, content.motion));
    text.push(SECTION_LABELS.motion.toUpperCase());
    for (const clip of content.motion) {
      text.push(clip.title, ...(clip.description ? [clip.description] : []), `${site}/motion/${clip.id}`, '');
    }
  }
  if (content.stills.length) {
    sections.push(sectionHeading(SECTION_LABELS.stills), photoGrid(site, images, content.stills));
    text.push(SECTION_LABELS.stills.toUpperCase());
    for (const photo of content.stills.slice(0, MAX_PHOTO_THUMBNAILS)) {
      const { heading, meta } = photoEmailCaption(photo);
      text.push(meta ? `${heading} — ${meta}` : heading);
    }
    const more = content.stills.length - MAX_PHOTO_THUMBNAILS;
    if (more > 0) text.push(`…and ${more} more`);
    text.push(`${site}/stills`, '');
  }

  sections.push(footer(manage, prefs, site));
  text.push('—', 'Change what you get, or unsubscribe:', manage);

  return {
    subject,
    html: shell(subject, subject, sections.join('\n')),
    text: text.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n'),
  };
}

/** The double opt-in email. Nothing else is ever sent to an unconfirmed address. */
export function renderConfirmation(confirmUrl: string, site: string): RenderedEmail {
  const subject = `Confirm your subscription to ${NEWSLETTER_NAME}`;
  const host = site.replace(/^https?:\/\//, '');
  const body = `<tr><td style="padding:24px 0 0;font:16px/1.6 ${SANS};color:${INK};">
  Someone — hopefully you — asked to get an email at this address when something new goes up on ${escapeHtml(NEWSLETTER_NAME)} (${siteLink(site, INK)}).
</td></tr>
<tr><td style="padding:24px 0 0;">
  <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:12px 20px;background:${INK};color:${PAPER};font:600 14px/1 ${SANS};letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">Confirm subscription</a>
</td></tr>
<tr><td style="padding:24px 0 0;font:13px/1.6 ${SANS};color:#6b6b72;">
  If that wasn't you, ignore this email: nothing more will be sent, and the address is deleted in a week.
</td></tr>`;

  return {
    subject,
    html: shell(subject, 'One click to confirm.', body),
    text: [
      `Someone — hopefully you — asked to get an email at this address when something new goes up on ${NEWSLETTER_NAME} (${host}).`,
      '',
      `Confirm: ${confirmUrl}`,
      '',
      "If that wasn't you, ignore this email: nothing more will be sent, and the address is deleted in a week.",
    ].join('\n'),
  };
}
