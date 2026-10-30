/**
 * "Confirma que eres tú" (PLAN D23): the riskiest actions want a second factor of the last 12 hours, and the page that
 * asks for it sends the person back to where they were. Plain functions, for pages and the browser alike.
 */

/** Where to go back to: a path of this app, never another site (`//elsewhere`, `/\elsewhere`) nor a full address. */
export const safeNext = (next: unknown): string =>
  typeof next === 'string' && /^\/(?![/\\])/u.test(next) ? next : '/';

/** The page that asks to confirm, coming back to `next`. */
export const confirmPath = (next: string): string =>
  `/confirmar?${new URLSearchParams({ next: safeNext(next) }).toString()}`;

/**
 * A download that is one of the riskiest actions (an export): straight away, or through "Confirma que eres tú" first,
 * coming back to `back`; never `download` then, which would save the confirmation page as a file.
 */
export const riskyDownload = (
  recent: boolean,
  href: string,
  back: string,
): { href: string; download?: true } =>
  recent ? { href, download: true } : { href: confirmPath(back) };

/** Where the browser is now, to come back to. */
export const here = (): string => `${window.location.pathname}${window.location.search}`;
