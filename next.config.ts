import type { NextConfig } from 'next';

// Photos are served through next/image pointed at the R2/CDN origin, so that
// origin has to be allow-listed. Derived from env rather than hardcoded so the
// bucket URL lives in exactly one place.
const mediaHostname = process.env.R2_PUBLIC_BASE_URL
  ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Checking the site on a phone means loading the dev server over the LAN, and
  // dev treats a non-localhost Host as cross-origin: it refuses the HMR socket,
  // the dev runtime never boots, and the page arrives as fully rendered HTML
  // with nothing hydrated — every control dead, which looks like a CSS bug and
  // is not one. Dev-only; production ignores this entirely.
  //
  // The private ranges are listed as wildcards rather than as today's address:
  // a DHCP lease or a different network hands the laptop a new IP, and the
  // symptom of a stale entry here is a page that looks fine and does nothing,
  // which is a bad thing to have to re-diagnose. Reaching it by hostname
  // (*.local) survives the address changing at all.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*', '*.local'],
  images: {
    remotePatterns: mediaHostname
      ? [{ protocol: 'https', hostname: mediaHostname }]
      : [],
  },
  // The same hostname, inlined into the client bundle. A journal post can carry
  // an image URL from anywhere — the editor accepts whatever Markdown is typed —
  // and next/image *throws* on a host that is not allow-listed above, taking the
  // whole page down rather than showing a broken image. PostMarkdown checks this
  // to decide which images it may hand to the optimiser.
  env: { NEXT_PUBLIC_MEDIA_HOST: mediaHostname ?? '' },
};

export default nextConfig;
