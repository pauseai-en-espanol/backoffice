import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const { name, version } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));

/**
 * On every response, pages and build assets alike (as the staff app). The Content Security Policy is the proxy's
 * (src/proxy.ts), since each page's has its own nonce.
 */
const SECURITY_HEADERS = [
  // No includeSubDomains: the forms host is configuration, and nothing here knows what its subdomains serve.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // A personal link's address holds nothing secret (its token is in the fragment, which browsers never send), but
  // other hosts are told nothing about the form all the same. Not no-referrer, under which browsers send a post's
  // Origin as `null`, which the form's routes refuse.
  { key: 'Referrer-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // For browsers older than frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Reached by its link, never through a search engine (the pages say so too, for crawlers that read only those).
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Trace dependencies from the monorepo root so the standalone output includes workspace packages.
  outputFileTracingRoot: join(appDir, '../..'),
  poweredByHeader: false,
  // No image optimizer: the form shows no images but its icon.
  images: { unoptimized: true },
  reactStrictMode: true,
  headers: async () => [{ source: '/:path*', headers: SECURITY_HEADERS }],
  // The release that events are tagged with. A build fact, not deployment configuration, so it is inlined.
  env: { APP_RELEASE: `${name.replace('@backoffice/', '')}@${version}` },
  compiler: {
    // Errors only: drop the Sentry SDK's tracing and debug code from the bundles (no withSentryConfig, ADR-0003).
    define: { __SENTRY_TRACING__: false, __SENTRY_DEBUG__: false },
  },
};

export default nextConfig;
