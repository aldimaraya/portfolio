'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { ADD_MEDIA_HREF, NAV_GROUPS, OVERVIEW, isActive, type NavItem } from './nav';
import { useSignOut } from './useSignOut';

const CONTENT = NAV_GROUPS[0].items;
/** Everything that is not Overview or Content goes behind More, so the bar stays at five thumb-sized tabs. */
const MORE = NAV_GROUPS.slice(1).flatMap((group) => group.items);

/**
 * The phone's version of the sidebar: the same destinations, at the bottom where
 * a thumb reaches, plus a floating Add button. Hidden from md up.
 */
export function AdminTabBar() {
  const pathname = usePathname();
  // The sheet remembers the page it was opened on, so navigating anywhere closes
  // it without an effect to reset it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const moreOpen = openOn === pathname;
  const setMoreOpen = (open: boolean) => setOpenOn(open ? pathname : null);
  const { busy, signOut } = useSignOut();
  const moreActive = MORE.some((item) => isActive(item.href, pathname));

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpenOn(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  return (
    <div className="md:hidden">
      {pathname === ADD_MEDIA_HREF ? null : (
        <Link
          href={ADD_MEDIA_HREF}
          aria-label="Add media"
          className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-gold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        >
          <Icon name="plus" size={24} />
        </Link>
      )}

      {moreOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-black/50"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="admin-more"
            className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-2 flex flex-col rounded-2xl border border-hairline bg-film p-2"
          >
            {MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href, pathname) ? 'page' : undefined}
                className="flex h-12 items-center gap-3 rounded-lg px-3 aria-[current=page]:text-gold"
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            ))}
            <div className="my-1 border-t border-hairline" />
            <Link href="/stills" className="flex h-12 items-center px-3 text-ash">
              View site ↗
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="flex h-12 items-center px-3 text-left text-ash disabled:opacity-50"
            >
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </>
      ) : null}

      <nav
        aria-label="Admin"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-hairline bg-film/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        {[OVERVIEW, ...CONTENT].map((item) => (
          <Tab key={item.href} item={item} active={isActive(item.href, pathname)} />
        ))}
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="admin-more"
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] ${
            moreActive || moreOpen ? 'text-gold' : 'text-ash'
          }`}
        >
          <Icon name="more" size={22} />
          More
        </button>
      </nav>
    </div>
  );
}

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] ${active ? 'text-gold' : 'text-ash'}`}
    >
      <Icon name={item.icon} size={22} />
      {item.label === 'Overview' ? 'Home' : item.label}
    </Link>
  );
}
