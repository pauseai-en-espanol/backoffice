import { postToApi } from '@/api';
import { parseFormInfo } from '@/census/answer';
import { json, readJsonBody } from '@/census/request';
import { isToken } from '@/census/token';
import { wordingVersion } from '@/config';
import { visitorAddress } from '@/visitor';

export const dynamic = 'force-dynamic';

/**
 * The form's lists and, for a personal link, its person's greeting (staff API spec, the forms app's routes): a page of
 * this host posts the token it read from its own address's fragment; this asks the API inside the cluster. Only POST,
 * so the token is never in an address any log keeps.
 */
export const POST = async (request: Request): Promise<Response> => {
  const read = await readJsonBody(request);
  if (!read.ok) {
    return json(read.status, { error: read.error });
  }
  const { token } = read.body;
  if (token !== undefined && !isToken(token)) {
    return json(200, {
      options: [],
      greeting: null,
      link: 'invalid',
      wordingVersion: wordingVersion(),
    });
  }
  const answer = await postToApi(
    '/public/census/form',
    token === undefined ? {} : { token },
    visitorAddress(request.headers.get('x-forwarded-for')),
  );
  const info = answer.status === 200 ? parseFormInfo(answer.body, wordingVersion()) : undefined;
  return info ? json(200, info) : json(answer.status === 429 ? 429 : 503, { error: 'unavailable' });
};
