/**
 * The census form's Content Security Policy (as the staff app's). Every page is rendered per request, so each gets
 * a nonce of its own: Next reads it from this header on the request and puts it on its scripts, and 'strict-dynamic'
 * lets those load the rest of the app's chunks. No other script runs, inline or from anywhere, so injected markup can't
 * run code where people type their details. Styles allow inline: the components' server-rendered style attributes
 * can't carry a nonce. Nothing loads from another host (no captcha, no analytics: ADR-0002 §7), no frame may hold a
 * page, and the form posts only to this app. `pnpm dev` alone adds 'unsafe-eval', which React's development build needs.
 */
export const contentSecurityPolicy = (nonce: string, development = false): string =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');

/** A nonce: 128 random bits, base64, new for every request. */
export const newNonce = (): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
