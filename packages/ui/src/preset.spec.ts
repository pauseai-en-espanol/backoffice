import { describe, expect, it } from 'vitest';

import { palette, roles } from './brand.js';
import { backofficePreset } from './preset.js';

describe('backofficePreset', () => {
  const tokens = backofficePreset.theme?.extend?.tokens;

  it('is named so Panda can de-duplicate it', () => {
    expect(backofficePreset.name).toBe('@backoffice/ui');
  });

  it('defines the shared font tokens, each falling back to the system font', () => {
    for (const name of ['display', 'body', 'numeric']) {
      expect(tokens?.fonts?.[name]?.value).toMatch(/^var\(--font-[a-z]+, system-ui\), /);
    }
    expect(tokens?.fonts).toHaveProperty('mono');
  });

  it('exposes the palette as tokens and the colour roles as semantic tokens', () => {
    expect(tokens?.colors?.brand).toMatchObject({ orange: { value: palette.orange } });
    expect(tokens?.colors?.brand).toMatchObject({ grey: { 700: { value: palette.grey[700] } } });
    expect(backofficePreset.theme?.extend?.semanticTokens?.colors).toMatchObject({
      bg: { accent: { value: roles.bg.accent }, attention: { value: roles.bg.attention } },
      fg: { default: { value: roles.fg.default }, negative: { value: roles.fg.negative } },
      border: { subtle: { value: roles.border.subtle } },
    });
  });
});
