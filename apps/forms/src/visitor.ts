import { isIP } from 'node:net';

/**
 * The visitor's address, which the API counts census answers by (staff API spec, the forms app's routes): the last
 * `X-Forwarded-For` entry, the one the gateway adds after dropping any the client sent, never an earlier one, which a
 * client can write (as apps/api's visitorAddress). Undefined without a valid one: the API then counts the forms app's
 * own address, which all such requests share.
 */
export const visitorAddress = (forwardedFor: string | null | undefined): string | undefined => {
  const last = forwardedFor
    ?.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .at(-1);
  return last !== undefined && isIP(last) !== 0 ? last : undefined;
};
