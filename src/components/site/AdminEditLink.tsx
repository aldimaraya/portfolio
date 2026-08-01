'use client';

import Link from 'next/link';
import { useIsAdmin } from './useIsAdmin';

/**
 * A jump straight to the admin form for one item, for pages that show a single
 * piece of content. Like [AdminBar], it renders nothing for visitors — and for
 * the same reason it asks the client rather than the server: a cookie read here
 * would make the journal post it sits on dynamic.
 */
export function AdminEditLink({ href, label = 'Edit' }: { href: string; label?: string }) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return null;

  return (
    <Link
      href={href}
      data-testid="admin-edit-link"
      className="font-mono text-xs tracking-[0.1em] text-gold uppercase transition hover:text-bone"
    >
      {label}
    </Link>
  );
}
