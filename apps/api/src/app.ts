import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { type StaffApiOptions, staffApiRoutes } from './auth/routes.js';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  /** Sign-in and the signed-in routes under /api, on the staff host only; without sign-in they answer 503. */
  api?: StaffApiOptions;
}

/**
 * Request logs never carry a body, a query string or a cookie (ADR-0002, logs and errors): Fastify's default request
 * serializer logs the URL with its query, so it is replaced by the method and the path.
 */
const serializers: NonNullable<Exclude<FastifyServerOptions['logger'], boolean>>['serializers'] = {
  req: (request: { method?: string; url?: string }) => ({
    method: request.method,
    path: request.url?.split(/[?#]/u, 1)[0],
  }),
};

export const buildApp = ({ logger = false, api = {} }: AppOptions = {}): FastifyInstance => {
  const app = Fastify({
    logger:
      logger === false || logger === true
        ? logger
        : { ...logger, serializers: { ...serializers, ...logger.serializers } },
    // Longer than the Envoy Gateway idle timeout (60s), so the gateway closes idle connections first.
    keepAliveTimeout: 75_000,
    // JSON bodies are small here: a form, never a file.
    bodyLimit: 64 * 1024,
    // A field a route doesn't take is refused (400), not silently dropped, as Fastify's default would: a client that
    // sends one is out of date or probing, and either should hear so.
    ajv: { customOptions: { removeAdditional: false } },
  });

  // Liveness only: deliberately no database or downstream checks, so a slow dependency never restarts the pod.
  // Not logged: probes run every few seconds.
  app.get('/healthz', { logLevel: 'silent' }, async () => ({ status: 'ok' }));

  void app.register(staffApiRoutes(api), { prefix: '/api' });
  return app;
};
