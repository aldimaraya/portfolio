import Link from 'next/link';
import { isAuthenticated } from '@/lib/auth/guard';

/**
 * A jump straight to the admin form for one item, for pages that show a single
 * piece of content. Like [AdminBar], it renders nothing for visitors.
 */
export async function AdminEditLink({
  href,
  label = 'Edit',
}: {
  href: string;
  label?: string;
}) {
  if (!(await isAuthenticated())) return null;

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
