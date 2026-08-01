'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NAV_TABS, SITE_NAME, SITE_TAGLINE } from '@/lib/site';

interface Underline {
  left: number;
  width: number;
}

export function Header() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [underline, setUnderline] = useState<Underline | null>(null);
  // Held back one frame so the bar appears under the current tab on first paint
  // rather than sliding in from the nav's left edge.
  const [slides, setSlides] = useState(false);

  const activeHref =
    NAV_TABS.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
      ?.href ?? null;

  const measure = useCallback(() => {
    const nav = navRef.current;
    const tab = activeHref ? tabRefs.current.get(activeHref) : null;
    if (!nav || !tab) {
      setUnderline(null);
      return;
    }

    // Measured against the nav, not the page, so the offset does not depend on
    // where the header happens to sit.
    const navBox = nav.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    setUnderline({ left: tabBox.left - navBox.left, width: tabBox.width });
  }, [activeHref]);

  // Layout effect because this reads geometry: measuring after paint would show
  // the bar at the previous tab's width for a frame on every navigation.
  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    // Tab widths move when the webfont swaps in, and a bar measured before that
    // lands stays visibly short of its label.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  useEffect(() => {
    if (!underline || slides) return;
    const frame = requestAnimationFrame(() => setSlides(true));
    return () => cancelAnimationFrame(frame);
  }, [underline, slides]);

  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
      {/* The wordmark doubles as the way home, which is what people try first. */}
      <Link href="/stills" className="block">
        <h1 className="text-2xl font-semibold tracking-tight uppercase">{SITE_NAME}</h1>
        <p className="mt-1 text-sm text-ash uppercase">{SITE_TAGLINE}</p>
      </Link>

      <nav ref={navRef} className="relative flex gap-6">
        {NAV_TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.href, node);
              else tabRefs.current.delete(tab.href);
            }}
            aria-current={tab.href === activeHref ? 'page' : undefined}
            className={`py-2 text-sm font-medium tracking-wider uppercase transition-colors ${
              tab.href === activeHref ? 'text-gold' : 'text-ash hover:text-gold'
            }`}
          >
            {tab.label}
          </Link>
        ))}

        {/* One bar for the whole nav rather than a pseudo-element per tab: two
            separate underlines cannot animate into one another, so sliding needs
            a single element that moves. -bottom-5 lands it on the header's
            bottom rule, matching the pb-5 above. */}
        {underline ? (
          <span
            aria-hidden
            data-testid="tab-underline"
            className={`absolute -bottom-5 left-0 h-0.5 bg-gold ${
              slides
                ? 'motion-safe:transition-[transform,width] motion-safe:duration-300 motion-safe:ease-out'
                : ''
            }`}
            style={{ width: underline.width, transform: `translateX(${underline.left}px)` }}
          />
        ) : null}
      </nav>
    </header>
  );
}
