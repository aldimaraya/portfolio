import { AdminNav } from '@/components/admin/AdminNav';
import { SITE_NAME } from '@/lib/site';

/**
 * Admin chrome. Access is gated by src/proxy.ts, so this layout can assume the
 * request already carries a valid session.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <p className="mb-4 font-mono text-xs tracking-[0.2em] text-gold uppercase">
        {SITE_NAME} / admin
      </p>
      <AdminNav />
      {children}
    </div>
  );
}
