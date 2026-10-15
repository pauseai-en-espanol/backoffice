// A stand-in for the cluster's gateway on the staff host (ADR-0001): /api and /telegram/webhook go to the API and
// everything else to the web app, the Host header passes through unchanged, and the client's address is appended to
// X-Forwarded-For, as Envoy does. Sign-in runs through it in e2e runs, so cookies, origins and the rate limiter's
// address work as in production. Run directly by Node (type stripping), so it imports nothing from the project.
//
// Every test's browser connects from this machine, so tests name the visitor they play in CLIENT_ADDRESS_HEADER: it
// stands for the connection's address, as distinct visitors' addresses would be, and is never passed on.
import { createServer, request as forward } from 'node:http';

const CLIENT_ADDRESS_HEADER = 'x-e2e-client-address';

const port = Number(process.env.PORT);
const api = new URL(process.env.API_UPSTREAM ?? '');
const web = new URL(process.env.WEB_UPSTREAM ?? '');

const toApi = (path: string): boolean =>
  path === '/api' || path.startsWith('/api/') || path === '/telegram/webhook';

const server = createServer((incoming, outgoing) => {
  const path = incoming.url ?? '/';
  const target = toApi(path) ? api : web;
  const { [CLIENT_ADDRESS_HEADER]: playing, ...headers } = incoming.headers;
  const client = typeof playing === 'string' ? playing : incoming.socket.remoteAddress;
  const forwardedFor = [headers['x-forwarded-for'], client]
    .filter((entry) => entry !== undefined && entry !== '')
    .join(', ');
  const upstream = forward(
    {
      host: target.hostname,
      port: target.port,
      method: incoming.method,
      path,
      headers: { ...headers, 'x-forwarded-for': forwardedFor },
      // A connection per request: a pooled one the upstream has just closed would fail the request.
      agent: false,
    },
    (answer) => {
      outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(outgoing);
    },
  );
  upstream.on('error', (error) => {
    console.error(`fake gateway: ${incoming.method} ${path} failed upstream: ${error.message}`);
    if (!outgoing.headersSent) {
      outgoing.writeHead(502);
    }
    outgoing.end();
  });
  incoming.pipe(upstream);
});

// Every interface, IPv4 and IPv6, so `localhost` reaches it whichever the browser tries first.
server.listen(port);
