'use client';

import { AdminBarNav } from './AdminBarNav';
import { useIsAdmin } from './useIsAdmin';

/**
 * Admin controls on the public pages, so an edit does not start by typing
 * /admin into the address bar. Renders nothing for visitors.
 *
 * A client component on purpose. Answering "is this the admin?" on the server
 * meant reading the session cookie in the public layout, and a layout that reads
 * cookies opts its whole subtree out of static rendering — the entire site
 * rendered per request so that one person's toolbar could be in the first paint.
 * The check now happens after hydration; see useIsAdmin.
 *
 * Nothing sensitive rides on that move. The bar is a set of links to /admin, and
 * every one of them is gated by proxy.ts and again inside each action.
 */
export function AdminBar() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return null;
  return <AdminBarNav />;
}
