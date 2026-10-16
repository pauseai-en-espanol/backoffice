import { redactText } from '@backoffice/observability/privacy';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { type StaffApiOptions, staffApiRoutes } from './auth/routes.js';
import { type CensusPublicOptions, censusPublicRoutes } from './census/public-routes.js';
import { telegramWebhookRoutes, type WebhookOptions } from './telegram/webhook.js';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  /** Sign-in and the signed-in routes under /api, on the staff host only; without sign-in they answer 503. */
  api?: StaffApiOptions;
  /** The Telegram bot's webhook (ADR-0004); without it, /telegram/webhook answers 503. */
  telegram?: WebhookOptions | undefined;
  /** The forms app's routes (ADR-0002 §7); without them, /public/census answers 503. */
  forms?: CensusPublicOptions | undefined;
}

/**
 * Request logs never carry a body, a query string or a cookie (ADR-0002, logs and errors): Fastify's default request
 * serializer logs the URL with its query, so it is replaced by the method and the path.
 */
type LoggerOptions = Exclude<NonNullable<FastifyServerOptions['logger']>, boolean>;

/**
 * An error as logged: its kind, code and constraint, and its words and stack without emails or phone numbers. A
 * database error's `detail` and `where` can quote a row's values, so they never are.
 */
export const serializeError = (
  error: unknown,
): { [key: string]: unknown; type: string; message: string; stack: string } => {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: '', stack: '' };
  }
  const { code, constraint, statusCode } = error as {
    code?: unknown;
    constraint?: unknown;
    statusCode?: unknown;
  };
  return {
    type: error.name,
    message: redactText(error.message),
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof constraint === 'string' ? { constraint } : {}),
    ...(typeof statusCode === 'number' ? { statusCode } : {}),
    stack: redactText(error.stack ?? ''),
  };
};

const serializers: LoggerOptions['serializers'] = {
  req: (request: { method?: string; url?: string }) => ({
    method: request.method,
    path: request.url?.split(/[?#]/u, 1)[0],
  }),
  err: serializeError,
};

/** Every log line's own words lose their emails and phone numbers too, whoever wrote them. */
const hooks: LoggerOptions['hooks'] = {
  logMethod(args, method) {
    method.apply(
      this,
      args.map((arg: unknown) => (typeof arg === 'string' ? redactText(arg) : arg)) as typeof args,
    );
  },
};

export const buildApp = ({
  logger = false,
  api = {},
  telegram,
  forms,
}: AppOptions = {}): FastifyInstance => {
  const app = Fastify({
    logger:
      logger === false || logger === true
        ? logger
        : { ...logger, serializers: { ...serializers, ...logger.serializers }, hooks },
    // Longer than the Envoy Gateway idle timeout (60s), so the gateway closes idle connections first.
    keepAliveTimeout: 75_000,
    // JSON bodies are small here: a form, never a file.
    bodyLimit: 64 * 1024,
    // A field a route doesn't take is refused (400), not silently dropped, as Fastify's default would: a client that
    // sends one is out of date or probing, and either should hear so.
    ajv: { customOptions: { removeAdditional: false } },
  });

  // An error no route caught: logged without what could quote a person (above), and answered without its words, which
  // may be the database's. Fastify's own refusals (a body too large, JSON that isn't) keep their answer.
  app.setErrorHandler(async (error, request, reply) => {
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      throw error;
    }
    request.log.error({ err: error }, 'request failed');
    return reply.code(500).send({ error: 'internal' });
  });

  // Liveness only: deliberately no database or downstream checks, so a slow dependency never restarts the pod.
  // Not logged: probes run every few seconds.
  app.get('/healthz', { logLevel: 'silent' }, async () => ({ status: 'ok' }));

  void app.register(staffApiRoutes(api), { prefix: '/api' });
  // The bot's webhook, outside /api, on the staff host (ADR-0004).
  void app.register(telegramWebhookRoutes(telegram));
  // The census form's, for the forms app inside the cluster, with its shared secret (ADR-0002 §7).
  void app.register(censusPublicRoutes(forms), { prefix: '/public/census' });
  return app;
};
