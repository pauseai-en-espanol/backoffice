import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Global's shared view link, sealed for the database (ADR-0005): admins set it in Ajustes, the API encrypts it with the
 * deployment's key (AIRTABLE_LINK_KEY) before it reaches Postgres, and only the sync opens it. AES-256-GCM with a fresh
 * 12-byte nonce each time and a fixed purpose as associated data, so a ciphertext from anywhere else doesn't open: a
 * backup or a dump without the key holds no usable link. Stored as `v1.` and the nonce, the tag and the ciphertext in
 * base64url. Nothing here ever logs or throws the link.
 */

const VERSION = 'v1';
const PURPOSE = Buffer.from('backoffice:airtable-link:v1', 'utf8');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** The link can't be opened with this key: another deployment's, or tampered with. Never holds either. */
export class LinkKeyError extends Error {
  constructor() {
    super("The Airtable link couldn't be opened with this deployment's key");
  }
}

/** AIRTABLE_LINK_KEY: 32 random bytes in base64 (`openssl rand -base64 32`), or undefined if it isn't one. */
export const readLinkKey = (value: string | undefined): Buffer | undefined => {
  if (value === undefined || !/^[A-Za-z0-9+/]{43}=$/u.test(value)) {
    return undefined;
  }
  const key = Buffer.from(value, 'base64');
  return key.length === 32 ? key : undefined;
};

export const sealLink = (link: string, key: Buffer): string => {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(PURPOSE);
  const body = Buffer.concat([cipher.update(link, 'utf8'), cipher.final()]);
  return `${VERSION}.${Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url')}`;
};

/** The link a ciphertext of sealLink holds. Throws LinkKeyError if it doesn't open with `key`. */
export const openLink = (sealed: string, key: Buffer): string => {
  const encoded = /^v1\.([\w-]+)$/u.exec(sealed)?.[1];
  const raw = encoded === undefined ? undefined : Buffer.from(encoded, 'base64url');
  if (raw === undefined || raw.length <= NONCE_BYTES + TAG_BYTES) {
    throw new LinkKeyError();
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, NONCE_BYTES), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(PURPOSE);
    decipher.setAuthTag(raw.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(NONCE_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new LinkKeyError();
  }
};
