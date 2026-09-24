import { headers } from 'next/headers';
import { siteUrl } from '@/lib/site-url';
import { isProductionDeployment } from './send';

/**
 * The origin an email's *links* should point at. Server-only.
 *
 * In production that is the canonical site. Anywhere else it is the origin the
 * request came in on: a confirmation email sent from `localhost:3000` has to
 * link back to localhost, because the pages it links to exist only in the code
 * being tested — production 404s on a confirm page it has not shipped yet.
 *
 * Images are the exception and always use `siteUrl()` (see emailImageUrl):
 * they are fetched by the recipient's mail provider, which cannot reach
 * localhost, and production's image optimiser serves them whatever branch is
 * running here.
 */
export async function linkOrigin(): Promise<string> {
  if (isProductionDeployment()) return siteUrl();
  return originFromHeaders(await headers()) ?? siteUrl();
}

/**
 * Trusting the Host header is only acceptable because this path never runs in
 * production: there, a forged Host would put an attacker's domain in a real
 * subscriber's confirmation link.
 */
export function originFromHeaders(source: Headers): string | null {
  const host = source.get('x-forwarded-host') ?? source.get('host');
  if (!host) return null;
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = source.get('x-forwarded-proto') ?? (local ? 'http' : 'https');
  return `${proto}://${host}`;
}
