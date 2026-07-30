import type { Metadata } from 'next';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_TAGLINE,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
