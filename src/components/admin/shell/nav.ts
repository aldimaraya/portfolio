import type { IconName } from './Icon';

/**
 * One definition of where things live in the admin, read by both the desktop
 * sidebar and the phone tab bar. A new feature gets a place in a group here
 * rather than another link on the end of a row — the old top bar grew that way.
 */
export type NavItem = { href: string; label: string; icon: IconName };

export const OVERVIEW: NavItem = { href: '/admin', label: 'Overview', icon: 'home' };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Content',
    items: [
      { href: '/admin/photos', label: 'Stills', icon: 'stills' },
      { href: '/admin/videos', label: 'Motion', icon: 'motion' },
      { href: '/admin/posts', label: 'Journal', icon: 'journal' },
    ],
  },
  { label: 'Audience', items: [{ href: '/admin/newsletter', label: 'Newsletter', icon: 'newsletter' }] },
  { label: 'Site', items: [{ href: '/admin/links', label: 'Links', icon: 'links' }] },
];

/** Where "Add media" goes, from the sidebar button, the phone's button and ⌘U. */
export const ADD_MEDIA_HREF = '/admin/add';

export function isActive(href: string, pathname: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}
