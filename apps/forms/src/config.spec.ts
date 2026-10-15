import { afterEach, describe, expect, it, vi } from 'vitest';

import { contactEmail, privacyNoticeUrl, productName, wordingVersion } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('config', () => {
  it('uses the privacy notice the deployment names, if it is an https address', () => {
    vi.stubEnv('PRIVACY_NOTICE_URL', 'https://example.org/privacidad');
    expect(privacyNoticeUrl()).toBe('https://example.org/privacidad');
    vi.stubEnv('PRIVACY_NOTICE_URL', 'javascript:alert(1)');
    expect(privacyNoticeUrl()).toBe('/privacidad');
    vi.stubEnv('PRIVACY_NOTICE_URL', '');
    expect(privacyNoticeUrl()).toBe('/privacidad');
  });

  it('takes a wording version of the API shape, else v1', () => {
    vi.stubEnv('WORDING_VERSION', 'v2.1');
    expect(wordingVersion()).toBe('v2.1');
    vi.stubEnv('WORDING_VERSION', 'V2 final');
    expect(wordingVersion()).toBe('v1');
  });

  it('leaves the name and the contact blank when unset', () => {
    vi.stubEnv('PRODUCT_NAME', '');
    vi.stubEnv('CONTACT_EMAIL', ' ');
    expect(productName()).toBe('');
    expect(contactEmail()).toBe('');
  });
});
