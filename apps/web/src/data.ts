import { redirect } from 'next/navigation';

import { getFromApi } from './api';
import { forwardedRequest, PAGE_OF } from './session';

/** A read the page couldn't make: the API is down, or answered something the page doesn't expect. */
export interface Unavailable {
  unavailable: true;
}

export const UNAVAILABLE: Unavailable = { unavailable: true };

export const isUnavailable = (value: unknown): value is Unavailable =>
  typeof value === 'object' && value !== null && 'unavailable' in value;

/**
 * A GET from the API for a signed-in page, with the browser's session. A session that ended since the page checked it
 * goes back to sign-in; any other failure is "unavailable", which the page says in words, and is logged by its status
 * only. `parse` checks the body's shape, so a page never renders from an answer it doesn't understand.
 */
export const readFromApi = async <T>(
  path: string,
  parse: (body: unknown) => T | undefined,
): Promise<T | Unavailable> => {
  let answer;
  try {
    answer = await getFromApi(path, await forwardedRequest());
  } catch (error) {
    console.error(`The API could not be reached for ${path.split('?')[0]}`, error);
    return UNAVAILABLE;
  }
  if (answer.status === 401) {
    redirect(PAGE_OF['signed-out']);
  }
  const parsed = answer.status === 200 ? parse(answer.body) : undefined;
  if (parsed === undefined) {
    console.error(`The API answered ${answer.status} for ${path.split('?')[0]}`);
    return UNAVAILABLE;
  }
  return parsed;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
