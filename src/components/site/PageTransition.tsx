'use client';

import { usePathname } from 'next/navigation';

/**
 * Dissolves each public page into place on navigation.
 *
 * The pathname is used as a React key rather than read for its value: changing a
 * key remounts the subtree, and a remounted element runs its CSS animation
 * again. Without it the wrapper persists across navigations and the animation
 * fires once, on first load, and never after.
 *
 * `children` arrives as a prop, so marking this file a client component does not
 * pull the pages themselves across the boundary — they stay server-rendered.
 *
 * Known cost: the remount discards the browser's scroll position on a back
 * navigation. Accepted deliberately — the alternative is animating without a
 * remount, which means tracking navigation direction and only animating forward,
 * for a gain that is invisible on three short pages.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
