import { Header } from './Header';

/**
 * Shared page bounds for the public site (the mockup's 1300px container and
 * 2.5rem/1.5rem body padding). Lives here so the four public pages don't each
 * repeat the wrapper markup.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1300px] px-6 py-10">
      <Header />
      {children}
    </div>
  );
}
