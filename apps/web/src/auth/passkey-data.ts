import { isNullableString, isRecord, isString, readFromApi } from '@/data';

/** One of the signed-in account's passkeys, as Ajustes lists it (`GET /api/passkeys`): never its key. */
export interface Passkey {
  id: string;
  name: string | null;
  /** Where it is kept ("1Password"), when the device said and the API knows it. */
  provider: string | null;
  /** Whether it travels between the person's devices (a password manager's or a platform's sync). */
  synced: boolean;
  createdAt: string | null;
}

const parsePasskey = (value: unknown): Passkey | undefined =>
  isRecord(value) &&
  isString(value.id) &&
  isNullableString(value.name) &&
  isNullableString(value.provider) &&
  typeof value.synced === 'boolean' &&
  isNullableString(value.createdAt)
    ? {
        id: value.id,
        name: value.name,
        provider: value.provider,
        synced: value.synced,
        createdAt: value.createdAt,
      }
    : undefined;

export const parsePasskeys = (body: unknown): Passkey[] | undefined => {
  if (!isRecord(body) || !Array.isArray(body.passkeys)) {
    return undefined;
  }
  const passkeys = body.passkeys.map(parsePasskey);
  return passkeys.every((passkey) => passkey !== undefined) ? passkeys : undefined;
};

/** The signed-in account's passkeys (PLAN D22). */
export const getPasskeys = () => readFromApi('/api/passkeys', parsePasskeys);
