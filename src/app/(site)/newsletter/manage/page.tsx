import type { Metadata } from 'next';
import Link from 'next/link';
import { ManageForm } from '@/components/newsletter/ManageForm';
import { db } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Email preferences',
  robots: { index: false, follow: false },
};

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = typeof token === 'string' ? token : '';
  const subscriber = value
    ? await db.subscriber.findUnique({
        where: { token: value },
        select: { email: true, journal: true, motion: true, stills: true },
      })
    : null;

  return (
    <main className="mx-auto max-w-md py-6">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">Email preferences</h2>
      {!subscriber ? (
        <p className="text-sm leading-relaxed text-ash">
          There’s no subscription behind this link — it may already have been cancelled.{' '}
          <Link href="/newsletter" className="text-gold hover:underline">
            Subscribe again
          </Link>
        </p>
      ) : (
        <>
          <p className="mb-8 text-sm text-ash">
            For <span className="text-bone">{subscriber.email}</span>
          </p>
          <ManageForm
            token={value}
            initial={{ journal: subscriber.journal, motion: subscriber.motion, stills: subscriber.stills }}
          />
        </>
      )}
    </main>
  );
}
