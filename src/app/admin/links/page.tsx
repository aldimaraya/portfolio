import { LinkBoard } from '@/components/admin/links/LinkBoard';
import { loadSiteLinks } from '@/lib/links/load';

export const dynamic = 'force-dynamic';

export default async function AdminLinksPage() {
  return <LinkBoard links={await loadSiteLinks()} />;
}
