import type { Metadata } from 'next';
import { SubscribeForm } from '@/components/newsletter/SubscribeForm';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Newsletter',
  description: `Get an email from ${SITE_NAME} when new photos, clips or journal posts go up.`,
  alternates: { canonical: '/newsletter' },
};

/** The permanent way in, for anyone who closed the prompt and changed their mind. */
export default function NewsletterPage() {
  return (
    <main className="mx-auto max-w-md py-6">
      <h2 className="text-2xl font-semibold tracking-tight">Get new work by email</h2>
      <p className="mt-3 mb-8 text-sm leading-relaxed text-ash">
        No schedule and no filler: one email when something new goes up, with a day’s uploads
        bundled together. Pick what you want to hear about, and change it any time from the link
        in every email.
      </p>
      <SubscribeForm />
    </main>
  );
}
