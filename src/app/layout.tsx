import type { Metadata } from 'next';
import { Source_Serif_4 } from 'next/font/google';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';
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
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_TAGLINE,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body className="min-h-screen bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
