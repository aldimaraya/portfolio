import { AdminBar } from '@/components/site/AdminBar';
import { Header } from '@/components/site/Header';
import { PageTransition } from '@/components/site/PageTransition';

/**
 * Chrome for the public pages. A route group, so it wraps /stills, /motion and
 * /journal without appearing in their URLs — and, unlike the wrapper component it
 * replaces, cannot be forgotten when a new public page is added.
 *
 * /admin and /login sit outside the group and keep their own chrome.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1300px] px-6 py-10">
      {/* Above the header, and outside the transition for the same reason: the
          bar is chrome, and it should not re-animate on every navigation. */}
      <AdminBar />
      {/* Outside the transition: the header is chrome that persists across
          navigations, and re-animating it would read as a page reload. */}
      <Header />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
