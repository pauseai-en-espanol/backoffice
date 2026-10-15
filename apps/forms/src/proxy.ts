import { type NextRequest, NextResponse } from 'next/server';

import { contentSecurityPolicy, newNonce } from './content-security-policy';

/**
 * Gives every response its Content Security Policy with a nonce of its own (content-security-policy.ts). The policy
 * goes on the request too: that is where Next reads the nonce to put on the page's scripts. The other security headers
 * are in next.config.js, on every response.
 */
export const proxy = (request: NextRequest): NextResponse => {
  const policy = contentSecurityPolicy(newNonce(), process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  return response;
};

export const config = {
  // Build assets are files, not pages: they need no nonce. Only they: a miss under `/_next/static/` is plain text,
  // while any other path can be an HTML page (the not-found page).
  matcher: ['/((?!_next/static/).*)'],
};
