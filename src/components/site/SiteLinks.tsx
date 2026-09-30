import { linkIcon, type LinkIcon, type SiteLink } from '@/lib/links/link';

/**
 * Brand marks from Simple Icons (CC0), each a single path drawn on a 24×24 box.
 * Inlined rather than installed: the package is thousands of icons for the sake
 * of a few, and the marks change about once a decade. Which host gets which mark
 * is decided in lib/links/link.ts.
 *
 * The viewBox is each path's own bounding box, not the 24×24 it was drawn on.
 * The header sits these on the tagline's baseline, and the YouTube mark alone
 * carries 3.5 units of blank above and below it: left in, that blank is what the
 * baseline would meet, and the mark would float visibly above the text.
 */
const ICONS: Record<LinkIcon, { viewBox: string; d: string }> = {
  youtube: {
    viewBox: '0 3.545 24 16.91',
    d: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  github: {
    viewBox: '0 0.297 24 23.406',
    d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
  instagram: {
    viewBox: '0 0 24 24',
    d: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  },
  vimeo: {
    viewBox: '0 1.605 24 20.791',
    d: 'M23.9765 6.4168c-.105 2.338-1.739 5.5429-4.894 9.6088-3.2679 4.247-6.0258 6.3699-8.2898 6.3699-1.409 0-2.578-1.294-3.553-3.881l-1.9179-7.1138c-.719-2.584-1.488-3.878-2.312-3.878-.179 0-.806.378-1.8809 1.132l-1.129-1.457a315.06 315.06 0 003.501-3.1279c1.579-1.368 2.765-2.085 3.5539-2.159 1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.5069.5389 2.45 1.1309 3.674 1.7759 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.8679 3.434-5.7568 6.7619-5.6368 2.4729.06 3.6279 1.664 3.4929 4.7969z',
  },
};

/** 16px tall at the mark's own proportions — roughly what the classes draw. */
function fallbackSize(viewBox: string) {
  const [, , width, height] = viewBox.split(' ').map(Number);
  return { width: Math.round((16 * width) / height), height: 16 };
}

/**
 * The outbound links, drawn in the header beside the wordmark and again in the
 * footer. Monochrome ash rather than brand colours: YouTube red would be the
 * loudest colour on a page whose only colour is meant to be the work's. A link
 * to a host with no mark falls back to its label, so adding one never needs an
 * icon first.
 *
 * A new tab, because every one of these leaves the site, and a visitor halfway
 * down the wall should not lose their place to a look at YouTube. `rel="me"`
 * only on profiles, where it is true — it is what lets Mastodon and IndieWeb
 * tools verify the account as this site's owner.
 *
 * Two navs with the same name would be ambiguous to a screen reader's landmark
 * list, hence the placement in the label.
 *
 * In the header every element here is inline, on purpose: the links are placed
 * inside the tagline's own line, and an inline SVG on `vertical-align: baseline`
 * is the one arrangement where the browser, not a hand-tuned offset, puts the
 * mark's foot on the text's baseline. Aligning boxes instead depends on the
 * font's descent and line-height, which is why that attempt sat right in one
 * browser and visibly high in another. Height in `em` keeps the mark in
 * proportion to the tagline at both of its sizes.
 */
export function SiteLinks({
  links,
  placement,
}: {
  links: readonly SiteLink[];
  placement: 'header' | 'footer';
}) {
  if (links.length === 0) return null;

  const header = placement === 'header';

  return (
    <nav
      aria-label={header ? 'Elsewhere' : 'Elsewhere (footer)'}
      className={header ? 'ml-2 inline' : undefined}
    >
      <ul className={header ? 'inline' : 'flex flex-wrap items-center justify-center gap-3'}>
        {links.map((link) => {
          const icon = linkIcon(link.href);
          return (
            <li key={link.href} className={header ? 'inline' : undefined}>
              <a
                href={link.href}
                target="_blank"
                rel={link.profile ? 'me noopener noreferrer' : 'noopener noreferrer'}
                aria-label={icon ? link.label : undefined}
                title={link.label}
                // The padding is the hit target: a bare 16px glyph is too small
                // to tap reliably, and the header on a phone is exactly where it
                // will be. On an inline element it widens what can be tapped
                // without moving the line it sits in.
                className={`p-1.5 text-ash transition-colors hover:text-gold ${
                  header ? 'inline' : 'flex items-center'
                }`}
              >
                {icon ? (
                  <svg
                    aria-hidden
                    viewBox={ICONS[icon].viewBox}
                    // A floor, not the size: the classes below override both. An
                    // svg with neither attribute renders at 300×150 whenever its
                    // stylesheet is late or stale — a hot reload that swaps the
                    // markup but not the CSS did exactly that — and two of those
                    // swallow the header.
                    {...fallbackSize(ICONS[icon].viewBox)}
                    fill="currentColor"
                    // Preflight makes every svg a block; the header needs it back
                    // in the line.
                    className={header ? 'inline h-[1.15em] w-auto align-baseline' : 'h-4 w-auto'}
                  >
                    <path d={ICONS[icon].d} />
                  </svg>
                ) : (
                  <span className="font-mono text-xs tracking-[0.15em] uppercase">
                    {link.label}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
