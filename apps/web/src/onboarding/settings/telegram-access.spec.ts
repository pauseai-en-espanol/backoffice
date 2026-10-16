import { describe, expect, it } from 'vitest';

import { usesTelegramBot } from './telegram-access';

describe('usesTelegramBot', () => {
  it('offers the bot to the onboarding role, with or without admin, and to nobody else', () => {
    expect(usesTelegramBot(['onboarding'])).toBe(true);
    expect(usesTelegramBot(['admin', 'onboarding'])).toBe(true);
    expect(usesTelegramBot(['onboarding', 'outreach'])).toBe(true);
    expect(usesTelegramBot(['admin'])).toBe(false);
    expect(usesTelegramBot(['outreach'])).toBe(false);
    expect(usesTelegramBot(['admin', 'outreach'])).toBe(false);
    expect(usesTelegramBot([])).toBe(false);
  });
});
