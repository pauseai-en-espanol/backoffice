/**
 * The deployment's configuration, read on the server: names, links and versions never live in code (CLAUDE.md).
 */

/** The product's name (PRODUCT_NAME); blank when unset, so pages show no name rather than a made-up one. */
export const productName = (): string => process.env.PRODUCT_NAME?.trim() ?? '';

/**
 * Where the privacy notice is (PRIVACY_NOTICE_URL, an https address), or this app's own draft at /privacidad until the
 * association publishes its notice (personal data spec, notice and rights).
 */
export const privacyNoticeUrl = (): string => {
  const configured = process.env.PRIVACY_NOTICE_URL?.trim();
  return configured && /^https:\/\/\S+$/u.test(configured) ? configured : '/privacidad';
};

/** The association's address for privacy questions (CONTACT_EMAIL); blank when unset. */
export const contactEmail = (): string => process.env.CONTACT_EMAIL?.trim() ?? '';

/**
 * The version of the consent wording people see (WORDING_VERSION, `v1` by default), recorded with each consent. The
 * API's answer names one too, and wins: it is the version the database records.
 */
export const wordingVersion = (): string => {
  const configured = process.env.WORDING_VERSION?.trim();
  return configured && /^[a-z0-9][a-z0-9.-]{0,39}$/u.test(configured) ? configured : 'v1';
};
