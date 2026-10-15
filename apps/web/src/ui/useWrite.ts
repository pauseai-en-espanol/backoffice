'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { messageFor, type WriteAnswer } from '@/write';

import { useAnnounce } from './announce';

/**
 * One write from a form or a button: busy while it runs, its refusal in words (by the API's code, write.ts), and on
 * success the result said in the page's live region and the page's data read again. A second press while one is
 * running does nothing.
 */
export const useWrite = (errors: Readonly<Record<string, string>>) => {
  const router = useRouter();
  const announce = useAnnounce();
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<WriteAnswer>();

  const run = async (
    call: () => Promise<WriteAnswer>,
    { done, refresh = true }: { done?: string; refresh?: boolean } = {},
  ): Promise<WriteAnswer | undefined> => {
    if (pending) {
      return undefined;
    }
    setPending(true);
    setRefusal(undefined);
    const answer = await call();
    setPending(false);
    if (!answer.ok) {
      setRefusal(answer);
      return answer;
    }
    if (done) {
      announce(done);
    }
    if (refresh) {
      router.refresh();
    }
    return answer;
  };

  return {
    pending,
    refusal,
    error: refusal ? messageFor(refusal, errors) : undefined,
    clear: () => setRefusal(undefined),
    run,
  };
};
