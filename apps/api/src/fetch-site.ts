import type { FastifyRequest } from 'fastify';

/**
 * Whether a browser says another site started this request (Fetch Metadata): for the GET routes that do something,
 * the exports, which the Origin check on writes doesn't cover. A download from the staff app (`same-origin`), an
 * address typed by hand (`none`) or a client without the header passes.
 */
export const fromAnotherSite = (request: Pick<FastifyRequest, 'headers'>): boolean => {
  const site = request.headers['sec-fetch-site'];
  return site === 'cross-site' || site === 'same-site';
};
