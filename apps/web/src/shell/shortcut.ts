import { useSyncExternalStore } from 'react';

/**
 * The search's shortcut, each system's own (PLAN R85): ⌘K on a Mac, an iPhone or an iPad, Ctrl K elsewhere. Only that
 * one, so on a Mac Ctrl K still deletes to the end of the line in a text field, and Ctrl Shift K, a browser's console,
 * is left alone.
 */

/** A Mac, an iPhone or an iPad, by the browser's user agent (an iPad asking for desktop sites says Macintosh). */
export const isApple = (userAgent: string): boolean => /Mac|iPhone|iPad|iPod/u.test(userAgent);

type Keys = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

export const isSearchShortcut = (event: Keys, apple: boolean): boolean =>
  event.key.toLowerCase() === 'k' &&
  (apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
  !event.altKey &&
  !event.shiftKey;

/** As ARIA writes it (aria-keyshortcuts), for assistive technology. */
export const searchShortcutAria = (apple: boolean): string => (apple ? 'Meta+K' : 'Control+K');

const unchanging = () => () => undefined;

/** Whether this browser is an Apple one: false on the server and while hydrating, the browser's answer after. */
export const useApple = (): boolean =>
  useSyncExternalStore(
    unchanging,
    () => isApple(navigator.userAgent),
    () => false,
  );
