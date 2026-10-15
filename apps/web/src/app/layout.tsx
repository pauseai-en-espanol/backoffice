import type { Metadata, Viewport } from 'next';
import type { PropsWithChildren } from 'react';

import { connection } from 'next/server';

import { productName } from '@/product';

import './globals.css';

// The product's name comes from configuration, never from code (CLAUDE.md). Without connection(), Next prerenders this
// at build time and the title would come from the build environment, not the deployment's. Pages add their own title
// before the name. The app is never for search engines.
export const generateMetadata = async (): Promise<Metadata> => {
  await connection();
  const name = productName();
  return {
    title: name ? { default: name, template: `%s · ${name}` } : undefined,
    robots: { index: false, follow: false },
  };
};

// Zoom stays enabled: WCAG 2.2 AA requires text to be resizable.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Spanish only (D6): every page is in Spanish, so screen readers read it so.
const RootLayout = ({ children }: Readonly<PropsWithChildren>) => (
  <html lang="es">
    <body>{children}</body>
  </html>
);

export default RootLayout;
