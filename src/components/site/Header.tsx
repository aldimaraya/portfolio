'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_TABS, SITE_NAME, SITE_TAGLINE } from '@/lib/site';

export function Header() {
  const pathname = usePathname();

  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight uppercase">{SITE_NAME}</h1>
        <p className="mt-1 text-sm text-ash uppercase">{SITE_TAGLINE}</p>
      </div>

      <nav className="flex gap-6">
        {NAV_TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              // The active tab's gold underline sits on the header's bottom
              // rule (-bottom-5 lines up with the pb-5 above).
              className={`relative py-2 text-sm font-medium tracking-wider uppercase transition-colors after:absolute after:-bottom-5 after:left-0 after:h-0.5 after:w-full ${
                isActive
                  ? 'text-gold after:bg-gold'
                  : 'text-ash hover:text-gold after:bg-transparent'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
