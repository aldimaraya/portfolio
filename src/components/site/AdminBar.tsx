import { isAuthenticated } from '@/lib/auth/guard';
import { AdminBarNav } from './AdminBarNav';

/**
 * Admin controls on the public pages, so an edit does not start by typing
 * /admin into the address bar. Renders nothing for visitors — the auth check is
 * on the server, so the markup never reaches an unauthenticated client.
 *
 * Reading the session cookie opts the public layout out of static rendering.
 * That costs nothing here: every public page already sets `force-dynamic`
 * because its content comes from the database on each request.
 */
export async function AdminBar() {
  if (!(await isAuthenticated())) return null;
  return <AdminBarNav />;
}
