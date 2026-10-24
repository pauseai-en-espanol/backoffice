import type { Page } from '@playwright/test';

/**
 * Waits until React has hydrated the page's first form (PLAN R88): one sent before goes as plain HTML, a POST to the
 * page itself, and what was typed is lost. A test that types and sends as soon as a page loads waits for this, as a
 * person on a slow phone would. React marks each element it has hydrated with its props.
 */
export const alive = async (page: Page): Promise<void> => {
  // A function, not a string: the page's Content Security Policy refuses `eval`, rightly.
  await page.waitForFunction(() => {
    const { document } = globalThis as unknown as {
      document: { querySelector: (selector: string) => object | null };
    };
    const form = document.querySelector('form');
    return form !== null && Object.keys(form).some((key) => key.startsWith('__reactProps$'));
  });
};
