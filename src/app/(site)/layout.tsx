import Link from 'next/link';
import { NewsletterPrompt } from '@/components/newsletter/NewsletterPrompt';
import { AdminBar } from '@/components/site/AdminBar';
import { Header } from '@/components/site/Header';
import { PageTransition } from '@/components/site/PageTransition';
import { SiteLinks } from '@/components/site/SiteLinks';
import { loadSiteLinks } from '@/lib/links/load';

/**
 * Chrome for the public pages. A route group, so it wraps /stills, /motion and
 * /journal without appearing in their URLs — and, unlike the wrapper component it
 * replaces, cannot be forgotten when a new public page is added.
 *
 * /admin and /login sit outside the group and keep their own chrome.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Read here, in the one place both the header and the footer are drawn, and
  // baked into each page's static HTML with the rest of it — the link actions
  // revalidate every page, so a visitor never waits on this query.
  const links = await loadSiteLinks();

  return (
    <div className="mx-auto max-w-[1300px] px-6 py-10">
      {/* Above the header, and outside the transition for the same reason: the
          bar is chrome, and it should not re-animate on every navigation. */}
      <AdminBar />
      {/* Outside the transition: the header is chrome that persists across
          navigations, and re-animating it would read as a page reload. */}
      <Header links={links} />
      <PageTransition>{children}</PageTransition>
      {/* The way back to the signup for anyone who closed the prompt. Quiet on
          purpose: the prompt already asked once. */}
      <footer className="mt-16 border-t border-hairline pt-6 text-center">
        <div className="mb-3">
          <SiteLinks links={links} placement="footer" />
        </div>
        <Link
          href="/newsletter"
          className="font-mono text-xs tracking-[0.15em] text-ash uppercase transition hover:text-gold"
        >
          Get new work by email
        </Link>
      </footer>
      {/* In the layout rather than a page, so its clock survives navigation. */}
      <NewsletterPrompt />
    </div>
  );
}
