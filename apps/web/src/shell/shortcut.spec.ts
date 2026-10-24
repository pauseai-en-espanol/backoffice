import { describe, expect, it } from 'vitest';

import { isApple, isSearchShortcut, searchShortcutAria } from './shortcut';

const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const press = (keys: Partial<Parameters<typeof isSearchShortcut>[0]>) => ({
  key: 'k',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...keys,
});

describe("the search's shortcut, each system's own (PLAN R85)", () => {
  it('tells an Apple browser from the rest', () => {
    expect(isApple(MAC)).toBe(true);
    expect(isApple(IPHONE)).toBe(true);
    expect(isApple(WINDOWS)).toBe(false);
    expect(isApple(LINUX)).toBe(false);
    expect(isApple(ANDROID)).toBe(false);
  });

  it('opens with ⌘K on a Mac, and leaves Ctrl K to the text fields', () => {
    expect(isSearchShortcut(press({ metaKey: true }), true)).toBe(true);
    expect(isSearchShortcut(press({ metaKey: true, key: 'K' }), true)).toBe(true);
    expect(isSearchShortcut(press({ ctrlKey: true }), true)).toBe(false);
  });

  it('opens with Ctrl K elsewhere, and not with the Windows key', () => {
    expect(isSearchShortcut(press({ ctrlKey: true }), false)).toBe(true);
    expect(isSearchShortcut(press({ metaKey: true }), false)).toBe(false);
  });

  it('leaves K on its own, and with Shift or Alt too, to the page and the browser', () => {
    for (const apple of [true, false]) {
      const mod = apple ? { metaKey: true } : { ctrlKey: true };
      expect(isSearchShortcut(press({}), apple)).toBe(false);
      expect(isSearchShortcut(press({ ...mod, shiftKey: true }), apple)).toBe(false);
      expect(isSearchShortcut(press({ ...mod, altKey: true }), apple)).toBe(false);
      expect(isSearchShortcut(press({ ...mod, metaKey: true, ctrlKey: true }), apple)).toBe(false);
      expect(isSearchShortcut(press({ ...mod, key: 'j' }), apple)).toBe(false);
    }
  });

  it('names the key to assistive technology as ARIA writes it', () => {
    expect(searchShortcutAria(true)).toBe('Meta+K');
    expect(searchShortcutAria(false)).toBe('Control+K');
  });
});
