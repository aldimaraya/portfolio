'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { setAdminState } from './useIsAdmin';

/**
 * Maps a public page to the admin screen that edits it, so the bar's main link
 * lands on the thing being looked at rather than the dashboard. Longest prefix
 * would matter if these ever nested; they do not, so a find is enough.
 */
const SECTIONS = [
  { prefix: '/stills', href: '/admin/photos', label: 'Manage photos' },
  { prefix: '/motion', href: '/admin/videos', label: 'Manage videos' },
  { prefix: '/journal', href: '/admin/posts', label: 'Manage posts' },
];

/**
 * A floating button rather than a strip across the top. The strip sat in the
 * layout's flow, so the admin saw every page pushed down by its height — the one
 * person checking how the site looks was the one person seeing it wrong. Fixed
 * and collapsed, it takes no space from the page until it is opened.
 *
 * Bottom-left because nothing else lives there: the newsletter prompt is a
 * centred dialog, and the filter sheet and lightbox cover the whole viewport.
 * z-40 keeps it under those (z-50) and the clip theatre (z-60) — a full-screen
 * view should not have admin chrome floating over the work.
 */
export function AdminBarNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const section = SECTIONS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );

  // Close on navigation, so a menu opened on one page is not still hanging open
  // over the next.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    // No navigation: signing out from a public page should leave you on that
    // page, just without the bar. The cookie is gone, but the admin state is
    // held on the client now, so it has to be told rather than re-fetched —
    // refresh() alone would re-render a static page that never knew.
    setAdminState(false);
    setBusy(false);
  }

  const itemClass =
    'block px-4 py-2 text-left text-ash transition hover:bg-film hover:text-bone';

  return (
    <div
      ref={rootRef}
      data-testid="admin-bar"
      // max() with the safe-area inset so the button clears a phone's home bar.
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 font-mono text-xs tracking-[0.15em] uppercase"
    >
      {open ? (
        <div
          id="admin-menu"
          className="absolute bottom-full left-0 mb-2 flex min-w-48 flex-col rounded border border-gold/30 bg-frame py-1 shadow-lg shadow-black/40"
        >
          {section ? (
            <Link href={section.href} className={itemClass}>
              {section.label}
            </Link>
          ) : null}
          <Link href="/admin" className={itemClass}>
            Dashboard
          </Link>
          <button type="button" onClick={signOut} disabled={busy} className={`${itemClass} disabled:opacity-50`}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="admin-menu"
        // The icon carries no text, so the name has to be given here.
        aria-label="Admin"
        // Dimmed until hovered, so it does not compete with the work.
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-frame text-gold shadow-lg shadow-black/40 transition hover:opacity-100 ${
          open ? 'opacity-100' : 'opacity-60'
        }`}
      >
        {/* A pencil: everything in the menu is a way into editing. */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
    </div>
  );
}
