import { postToApi } from '@/api';
import { json, passBack, readJsonBody } from '@/census/request';
import { isToken } from '@/census/token';
import { visitorAddress } from '@/visitor';

export const dynamic = 'force-dynamic';

/**
 * Sends a census answer to the API inside the cluster (staff API spec, the forms app's routes), with the visitor's
 * address, which the API counts answers by, the honeypot (`website`) and the time the form was loaded (`startedAt`),
 * which the API checks. Its answer comes back as its status, outcome, error and field only.
 */
export const POST = async (request: Request): Promise<Response> => {
  const read = await readJsonBody(request);
  if (!read.ok) {
    return json(read.status, { error: read.error });
  }
  const { token, startedAt, website, answer } = read.body;
  if (
    (token !== undefined && !isToken(token)) ||
    typeof startedAt !== 'number' ||
    typeof website !== 'string' ||
    typeof answer !== 'object' ||
    answer === null ||
    Array.isArray(answer)
  ) {
    return json(400, { error: 'invalid' });
  }
  const sent = await postToApi(
    '/public/census/submit',
    { ...(token === undefined ? {} : { token }), startedAt, website, answer },
    visitorAddress(request.headers.get('x-forwarded-for')),
  );
  const status = [200, 400, 409, 429].includes(sent.status) ? sent.status : 503;
  return json(status, status === 503 ? { error: 'unavailable' } : passBack(sent.body));
};
