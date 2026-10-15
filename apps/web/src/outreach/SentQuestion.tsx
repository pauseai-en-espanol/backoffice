'use client';

import { useRouter } from 'next/navigation';

import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { markSent } from './actions';

export interface SentQuestionText {
  sentQuestion: string;
  sentHint: string;
  yes: string;
  notNow: string;
  notNowHint: string;
  skip: string;
  skipHint: string;
  logged: string;
  alreadySent: string;
  skipped: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * Siguiente's question once the sender has the letter (outreach spec §3): "Sí, enviada" records that they sent it from
 * their own mail, with the template's version, and the page reads the next one; "Ahora no" records nothing and moves
 * on, leaving this one for later in this visit (`skipHref`). A letter that can't be sent only offers to move on.
 * Nothing here sends anything.
 */
export const SentQuestion = ({
  targetId,
  templateVersion,
  sendable,
  skipHref,
  text,
}: {
  targetId: string;
  templateVersion: number | null;
  sendable: boolean;
  skipHref: string;
  text: SentQuestionText;
}) => {
  const router = useRouter();
  const announce = useAnnounce();
  const write = useWrite(text.errors);

  const skip = () => {
    announce(text.skipped);
    router.push(skipHref);
  };

  if (!sendable) {
    return (
      <div className={ui.form}>
        <p className={ui.hint}>{text.skipHint}</p>
        <div>
          <button type="button" className={ui.secondaryButton} onClick={skip}>
            {text.skip}
          </button>
        </div>
      </div>
    );
  }

  const yes = async () => {
    const answer = await write.run(() => markSent(targetId, templateVersion), {
      done: text.logged,
    });
    // Already sent (by someone else, or in another tab): said as such, and the page moves on all the same.
    if (answer?.status === 409 && answer.error === 'stale') {
      write.clear();
      announce(text.alreadySent);
      router.refresh();
    }
  };

  return (
    <div role="group" aria-labelledby="enviada-pregunta" className={ui.confirm}>
      <p id="enviada-pregunta" className={ui.label}>
        {text.sentQuestion}
      </p>
      <p className={ui.hint}>{text.sentHint}</p>
      <div className={ui.rowActions}>
        <button
          type="button"
          className={ui.button}
          aria-disabled={write.pending}
          onClick={() => void yes()}
        >
          {text.yes}
        </button>
        <button
          type="button"
          className={ui.secondaryButton}
          aria-describedby="ahora-no-pista"
          onClick={skip}
        >
          {text.notNow}
        </button>
      </div>
      <p id="ahora-no-pista" className={ui.hint}>
        {text.notNowHint}
      </p>
      <FormError message={write.error} />
    </div>
  );
};
