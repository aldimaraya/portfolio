import { LoginForm } from '@/components/site/LoginForm';
import { SITE_NAME } from '@/lib/site';

/**
 * The `next` destination is read server-side and passed down, rather than the
 * form calling useSearchParams() — that hook would force this page into a
 * Suspense boundary to prerender.
 *
 * Only relative paths are forwarded, so a crafted `?next=https://evil.example`
 * can't turn the login form into an open redirect.
 */
function safeNext(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return '/admin';
  return candidate;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-mono text-xs tracking-[0.2em] text-ash uppercase">
        {SITE_NAME} — admin access
      </h1>
      <LoginForm next={next} />
    </main>
  );
}
