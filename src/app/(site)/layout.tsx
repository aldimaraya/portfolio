import { Header } from '@/components/site/Header';

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
      <Header />
      {children}
    </div>
  );
}
