'use client';

import { useRouter } from 'next/navigation';

import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { claimTarget } from './actions';

export interface ClaimTargetText {
  intro: string;
  claim: string;
  claimed: string;
  taken: string;
  notNow: string;
  skipped: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * Siguiente, for a target nobody holds yet: "Me lo quedo" makes it mine before I write, so nobody else is offered the
 * same letter meanwhile; then the page shows the ways to send it. If someone got there first, it says so and moves on.
 * "Ahora no" leaves it for later in this visit (`skipHref`).
 */
export const ClaimTarget = ({
  targetId,
  skipHref,
  text,
}: {
  targetId: string;
  skipHref: string;
  text: ClaimTargetText;
}) => {
  const router = useRouter();
  const announce = useAnnounce();
  const write = useWrite(text.errors);

  const claim = async () => {
    const answer = await write.run(() => claimTarget(targetId), { done: text.claimed });
    if (answer?.ok) {
      router.refresh();
    } else if (answer?.status === 409 && answer.error === 'taken') {
      write.clear();
      announce(text.taken);
      router.refresh();
    }
  };

  const skip = () => {
    announce(text.skipped);
    router.push(skipHref);
  };

  return (
    <div className={ui.form}>
      <p className={ui.hint}>{text.intro}</p>
      <div className={ui.rowActions}>
        <button
          type="button"
          className={ui.button}
          aria-disabled={write.pending}
          onClick={() => void claim()}
        >
          {text.claim}
        </button>
        <button type="button" className={ui.secondaryButton} onClick={skip}>
          {text.notNow}
        </button>
      </div>
      <FormError message={write.error} />
    </div>
  );
};
