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
  // The tab that has been clicked but not yet arrived. A prefetched route still
  // costs 130–580ms between the click and the URL changing, because the router
  // will not commit the navigation until the incoming page has rendered — and
  // `pathname` only moves at that commit. Driving the underline from the
  // pathname alone therefore leaves it parked on the old tab for that whole
  // window, which is what makes a click read as ignored. This is presentational
  // only: it moves the highlight, never the route.
  //
  // The pathname the click was made from is stored alongside it so the guess
  // expires on its own: once the router commits, `from` no longer matches and
  // the tab below falls back to the real one. That covers a navigation that
  // never lands as well as one that does, with no effect and no timer — there is
  // no state here that can be left stale, because none of it is ever cleared.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);

  const settledHref =
    NAV_TABS.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
      ?.href ?? null;
  const activeHref = pending?.from === pathname ? pending.href : settledHref;

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
    // Tighter on a phone: the masthead and tabs were spending 129px of a 659px
    // screen before the filters even began, so the first photograph started
    // two-thirds of the way down the first view of a photography site.
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-4 sm:mb-8 sm:gap-4 sm:pb-5">
      {/* The wordmark doubles as the way home, which is what people try first. */}
      <Link href="/stills" className="block" onClick={() => setPending({ href: '/stills', from: pathname })}>
        <h1 className="text-xl font-semibold tracking-tight uppercase sm:text-2xl">
          {SITE_NAME}
        </h1>
        <p className="mt-0.5 text-xs text-ash uppercase sm:mt-1 sm:text-sm">{SITE_TAGLINE}</p>
      </Link>

      <nav ref={navRef} className="relative flex gap-5 sm:gap-6">
        {NAV_TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.href, node);
              else tabRefs.current.delete(tab.href);
            }}
            // aria-current follows the settled route, not the optimistic one: a
            // screen reader announcing the page as current before it exists is a
            // worse lie than a late highlight is a delay.
            aria-current={tab.href === settledHref ? 'page' : undefined}
            onClick={() => setPending({ href: tab.href, from: pathname })}
            className={`py-1.5 text-sm font-medium tracking-wider uppercase transition-colors sm:py-2 ${
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
            className={`absolute -bottom-4 left-0 h-0.5 bg-gold sm:-bottom-5 ${
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
