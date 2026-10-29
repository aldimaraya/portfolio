import { LinkList } from '@/components/admin/LinkList';
import { LABEL } from '@/components/admin/fields';
import { loadSiteLinks } from '@/lib/links/load';

export const dynamic = 'force-dynamic';

export default async function AdminLinksPage() {
  const links = await loadSiteLinks();

  return (
    <section>
      <h2 className={`mb-2 ${LABEL}`}>Links ({links.length})</h2>
      <p className="mb-6 text-sm text-ash">
        Shown as icons beside your name and in the footer of every page. YouTube, GitHub,
        Instagram and Vimeo addresses get their icon automatically; anything else is shown
        as its label.
      </p>
      <LinkList links={links} />
    </section>
  );
}
