'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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

export function AdminBarNav() {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  const section = SECTIONS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );

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

  return (
    <div
      data-testid="admin-bar"
      className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-gold/30 bg-frame px-4 py-2 font-mono text-xs tracking-[0.15em] uppercase"
    >
      <span className="text-gold">Admin</span>

      {section ? (
        <Link href={section.href} className="text-ash transition hover:text-bone">
          {section.label}
        </Link>
      ) : null}

      <Link href="/admin" className="text-ash transition hover:text-bone">
        Dashboard
      </Link>

      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="ml-auto text-ash transition hover:text-bone disabled:opacity-50"
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
