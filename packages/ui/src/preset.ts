import { definePreset, type Preset } from '@pandacss/dev';

import { fontVariables, palette, roles } from './brand.js';

type Tokens<T> = { [K in keyof T]: T[K] extends string ? { value: string } : Tokens<T[K]> };

const asTokens = <T extends object>(values: T): Tokens<T> =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'string' ? { value } : asTokens(value as object),
    ]),
  ) as Tokens<T>;

/** A font stack that starts with the app's self-hosted face, or the system font when the app loads none. */
const stack = (variable: string, ...fallbacks: string[]): string =>
  [`var(${variable}, system-ui)`, ...fallbacks].join(', ');

/**
 * The shared Panda preset for apps/web, and from M2 the census form (ADR-0003). Tokens live here, never in an app.
 * Colours are used through the semantic tokens only (`bg.*`, `fg.*`, `border.*`), so a dark mode redefines those.
 * The status tokens (attention, positive, negative, info) always go with an icon and words, never alone.
 */
export const backofficePreset: Preset = definePreset({
  name: '@backoffice/ui',
  globalCss: {
    body: { fontFamily: 'body', color: 'fg.default', bg: 'bg.canvas' },
  },
  theme: {
    extend: {
      tokens: {
        colors: { brand: asTokens(palette) },
        fonts: {
          display: { value: stack(fontVariables.display, '"Arial Narrow"', 'sans-serif') },
          body: { value: stack(fontVariables.body, 'sans-serif') },
          numeric: { value: stack(fontVariables.numeric, '"Arial Black"', 'sans-serif') },
          mono: { value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
        },
      },
      semanticTokens: {
        colors: asTokens(roles),
      },
    },
  },
});
