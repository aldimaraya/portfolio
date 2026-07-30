import type { NextConfig } from 'next';

// Photos are served through next/image pointed at the R2/CDN origin, so that
// origin has to be allow-listed. Derived from env rather than hardcoded so the
// bucket URL lives in exactly one place.
const mediaHostname = process.env.R2_PUBLIC_BASE_URL
  ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: mediaHostname
      ? [{ protocol: 'https', hostname: mediaHostname }]
      : [],
  },
};

export default nextConfig;
