'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SITE_NAME } from '@/lib/site';
import { Icon } from './Icon';
import { ADD_MEDIA_HREF, NAV_GROUPS, OVERVIEW, isActive, type NavItem } from './nav';
import { useSignOut } from './useSignOut';

/** Per-link annotations, keyed by href: a plain count, or a gold badge for something to act on. */
export type NavNotes = Record<string, { text: string; badge?: boolean }>;

export function AdminSidebar({ notes }: { notes: NavNotes }) {
  const pathname = usePathname();
  const router = useRouter();
  const { busy, signOut } = useSignOut();

  // ⌘U / Ctrl+U opens Add media from anywhere in the admin. Chrome on Windows
  // binds Ctrl+U to view-source; the admin is the one place that is fine to take.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        router.push(ADD_MEDIA_HREF);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <nav
      aria-label="Admin"
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-hairline bg-film px-3.5 py-5 md:flex"
    >
      <Link href="/admin" className="px-2 font-mono text-[11px] tracking-[0.2em] text-gold uppercase">
        {SITE_NAME} / admin
      </Link>

      <Link
        href={ADD_MEDIA_HREF}
        className="flex h-11 items-center justify-between gap-2 rounded-lg bg-gold px-3.5 font-semibold text-ink transition hover:brightness-110"
      >
        <span className="flex items-center gap-2">
          <Icon name="plus" />
          Add media
        </span>
        <kbd className="font-mono text-[11px] font-normal opacity-70">⌘U</kbd>
      </Link>

      <div className="flex flex-col gap-0.5">
        <SidebarLink item={OVERVIEW} pathname={pathname} note={notes[OVERVIEW.href]} />
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-ash uppercase">{group.label}</div>
          {group.items.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} note={notes[item.href]} />
          ))}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-hairline pt-3.5 text-sm text-ash">
        <Link href="/stills" className="flex h-9 items-center px-2.5 transition hover:text-bone">
          View site ↗
        </Link>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="flex h-9 items-center px-2.5 text-left transition hover:text-bone disabled:opacity-50"
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </nav>
  );
}

function SidebarLink({ item, pathname, note }: { item: NavItem; pathname: string; note?: NavNotes[string] }) {
  const active = isActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition ${
        active ? 'bg-frame text-bone' : 'text-[#b4b4ba] hover:bg-frame/60 hover:text-bone'
      }`}
    >
      <Icon name={item.icon} className={active ? 'text-gold' : undefined} />
      {item.label}
      {note ? (
        note.badge ? (
          <span className="ml-auto flex h-[18px] min-w-5 items-center justify-center rounded-full bg-gold/15 px-1.5 text-[11px] text-gold">
            {note.text}
          </span>
        ) : (
          <span className="ml-auto text-xs text-ash">{note.text}</span>
        )
      ) : null}
    </Link>
  );
}
