import { AdminSidebar, type NavNotes } from '@/components/admin/shell/AdminSidebar';
import { AdminTabBar } from '@/components/admin/shell/AdminTabBar';
import { AddQueueProvider } from '@/components/admin/add/AddQueue';
import { attentionCount, loadAdminCounts } from '@/lib/admin/counts';

// The sidebar's counts must be the database's, not a build-time snapshot.
export const dynamic = 'force-dynamic';

/**
 * Admin chrome. Access is gated by src/proxy.ts, so this layout can assume the
 * request already carries a valid session.
 *
 * The journal editor draws over all of this (`.editor-shell` is fixed, z-40),
 * so it keeps the whole window; the tab bar and its button sit below it at z-30.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const counts = await loadAdminCounts();
  const attention = attentionCount(counts);
  const notes: NavNotes = {
    '/admin/photos': { text: String(counts.photos) },
    '/admin/videos': { text: String(counts.videos) },
  };
  if (attention > 0) notes['/admin'] = { text: String(attention), badge: true };
  if (counts.drafts > 0) {
    notes['/admin/posts'] = { text: `${counts.drafts} draft${counts.drafts === 1 ? '' : 's'}` };
  }

  // Around the chrome as well as the page: the queue keeps uploading while the
  // admin moves between pages, and the sidebar's button reports on it.
  return (
    <AddQueueProvider>
      <div className="md:flex">
        <AdminSidebar notes={notes} unpublished={counts.unpublished} />
        {/* The bottom padding clears the phone's tab bar and floating Add button. */}
        <main className="min-w-0 flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
        <AdminTabBar />
      </div>
    </AddQueueProvider>
  );
}
