import type { Metadata } from 'next';
import { Source_Serif_4 } from 'next/font/google';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';
import { siteUrl } from '@/lib/site-url';
import './globals.css';

/**
 * The journal's reading face, and the only webfont the site loads. Exposed as a
 * variable rather than applied to the body: it dresses post prose only, while
 * the nav, captions and every admin surface stay on the system sans and mono
 * they were designed in.
 *
 * A sturdy humanist serif on purpose — the high-contrast alternatives thin out
 * badly as light text on a dark ground, which is the only way it is ever seen
 * here.
 */
const serif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-reading',
});

export const metadata: Metadata = {
  // Without this, every relative metadata URL — including the generated
  // opengraph-image — resolves against nothing, and Next drops it. The visible
  // symptom is a link shared to Slack or iMessage unfurling as bare text, which
  // is worth more to a portfolio than most of the site's own chrome.
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    // Page titles set their own short name; the site name is appended here so no
    // page has to repeat it.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_TAGLINE,
    url: '/',
  },
  // Next derives the Twitter card's image from opengraph-image.tsx on its own —
  // only the card type has to be declared, and `summary_large_image` is the one
  // that shows a 1200×630 image rather than a thumbnail beside the text.
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body className="min-h-screen bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
