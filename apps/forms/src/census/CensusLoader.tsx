'use client';

import dynamic from 'next/dynamic';

/**
 * The census form, rendered in the browser only: a personal link's token is in the address's fragment, which the server
 * never receives, and both forms load their lists through this app's server once the page is open.
 */
export const CensusLoader = dynamic(async () => (await import('./CensusForm')).CensusForm, {
  ssr: false,
});
