import type { Metadata } from 'next';
import Link from 'next/link';
import { ConfirmButton } from '@/components/newsletter/ConfirmButton';
import { db } from '@/lib/db';

// A personal link, not a page: nothing here belongs in a search index.
export const metadata: Metadata = {
  title: 'Confirm subscription',
  robots: { index: false, follow: false },
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = typeof token === 'string' ? token : '';
  const subscriber = value
    ? await db.subscriber.findUnique({ where: { token: value }, select: { confirmedAt: true } })
    : null;

  return (
    <main className="mx-auto max-w-md py-6">
      <h2 className="mb-4 text-2xl font-semibold tracking-tight">Confirm your subscription</h2>
      {!subscriber ? (
        <p className="text-sm leading-relaxed text-ash">
          This link has expired or isn’t valid. Unconfirmed sign-ups are deleted after a week —{' '}
          <Link href="/newsletter" className="text-gold hover:underline">
            sign up again
          </Link>{' '}
          and use the newest email.
        </p>
      ) : subscriber.confirmedAt ? (
        <p className="text-sm leading-relaxed text-ash">
          You’re already confirmed. Every email has a link to change what you get or unsubscribe.
        </p>
      ) : (
        <>
          <p className="mb-6 text-sm leading-relaxed text-ash">
            One click and you’re on the list.
          </p>
          <ConfirmButton token={value} />
        </>
      )}
    </main>
  );
}
