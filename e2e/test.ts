import {
  test as base,
  type BrowserContext,
  type BrowserContextOptions,
  expect,
} from '@playwright/test';

/** React's production builds name a failed hydration by its number (react.dev/errors): a mismatch, or a recovery. */
const HYDRATION = /Minified React error #4(?:18|19|21|22|23|25)\b|Hydration failed/u;

/**
 * Records what any page of `context` got wrong, popups included: the Content Security Policy violations it logs, and
 * a failed hydration (PLAN R87), after which React draws the page again in the browser and what was typed is lost.
 */
const watch = (context: BrowserContext, problems: string[]): void => {
  context.on('console', (message) => {
    if (/Content Security Policy/iu.test(message.text())) {
      problems.push(`${message.location().url}: ${message.text()}`);
    }
  });
  context.on('weberror', (error) => {
    if (HYDRATION.test(error.error().message)) {
      problems.push(`${error.page()?.url() ?? ''}: ${error.error().message}`);
    }
  });
};

/**
 * Playwright's `test`, failing any test whose pages log a Content Security Policy violation or fail to hydrate: every
 * page the suite visits, public or admin, is checked, not only those whose tests say so. A violation is a script,
 * style or request the page needed and the policy refused (or something injected, which it rightly refused); a failed
 * hydration, a page the server drew otherwise than the browser does (PLAN R87). Either way, it is to be looked at, not
 * left in the console. A test that needs a browser of its own (another person's, say) takes it from `newContext`,
 * which is watched the same way.
 */
export const test = base.extend<{
  pageGuard: string[];
  newContext: (options?: BrowserContextOptions) => Promise<BrowserContext>;
}>({
  pageGuard: [
    async ({ context }, use) => {
      const problems: string[] = [];
      watch(context, problems);
      await use(problems);
      expect(
        problems,
        'Content Security Policy violations and failed hydrations on the pages this test opened',
      ).toEqual([]);
    },
    { auto: true },
  ],
  // Closed before the guard checks what they logged.
  newContext: async ({ browser, pageGuard: problems }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      const context = await browser.newContext(options);
      watch(context, problems);
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect };
