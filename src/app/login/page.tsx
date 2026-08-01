import { LoginForm } from '@/components/site/LoginForm';
import { SITE_NAME } from '@/lib/site';
import { safeNextPath } from '@/lib/auth/next-path';

/**
 * The `next` destination is read server-side and passed down, rather than the
 * form calling useSearchParams() — that hook would force this page into a
 * Suspense boundary to prerender.
 *
 * Only paths on this site are forwarded, so a crafted `?next=` cannot turn the
 * login form into an open redirect — see safeNextPath, which is where that rule
 * lives so it can be tested.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-mono text-xs tracking-[0.2em] text-ash uppercase">
        {SITE_NAME} — admin access
      </h1>
      <LoginForm next={next} />
    </main>
  );
}
