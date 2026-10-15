import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const { name, version } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));

/**
 * On every response, pages and build assets alike (as aiontheballot's admin). The Content Security Policy is the
 * proxy's (src/proxy.ts), since each page's has its own nonce.
 */
const SECURITY_HEADERS = [
  // No includeSubDomains: the staff host is configuration, and nothing here knows what its subdomains serve.
  // Browsers ignore it over plain http (local runs).
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Addresses in the staff app name people and their work: other hosts are told nothing about them. Not no-referrer,
  // under which browsers send a form's post with `Origin: null`, which the API's origin checks refuse.
  { key: 'Referrer-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // For browsers older than frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Trace dependencies from the monorepo root so the standalone output includes workspace packages.
  outputFileTracingRoot: join(appDir, '../..'),
  poweredByHeader: false,
  // No image optimizer: the app shows no images but its icon, so `/_next/image` would only be a fetch inside the
  // server for every caller. Off, it is the not-found page.
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
