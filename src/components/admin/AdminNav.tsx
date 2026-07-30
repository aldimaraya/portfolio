'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/photos', label: 'Photos' },
  { href: '/admin/videos', label: 'Videos' },
  { href: '/admin/posts', label: 'Posts' },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    // The proxy gate sees the cleared cookie and bounces /admin to /login.
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="mb-8 flex flex-wrap items-center gap-6 border-b border-hairline pb-4">
      {LINKS.map((link) => {
        const isActive =
          link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive ? 'text-sm text-gold' : 'text-sm text-ash transition hover:text-bone'
            }
          >
            {link.label}
          </Link>
        );
      })}

      <Link
        href="/stills"
        className="ml-auto text-sm text-ash transition hover:text-bone"
      >
        View site
      </Link>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="text-sm text-ash transition hover:text-bone disabled:opacity-50"
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </nav>
  );
}
