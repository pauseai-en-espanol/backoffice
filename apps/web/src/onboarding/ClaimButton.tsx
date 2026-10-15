'use client';

import { useRouter } from 'next/navigation';

import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as styles from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { claim } from './actions';

export interface ClaimText {
  /** The button's name for screen readers, with the person's name ("Me quedo a Ana"). */
  label: string;
  visible: string;
  claimed: string;
  /** Said when someone else claimed them first (409). */
  taken: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * "Me lo quedo" (onboarding spec, views): the staff member becomes the person's owner. If someone was faster, that is
 * said in the page's live region (the row goes away as the list is read again, and would take a message of its own
 * with it).
 */
export const ClaimButton = ({ personId, text }: { personId: string; text: ClaimText }) => {
  const router = useRouter();
  const announce = useAnnounce();
  const write = useWrite(text.errors);
  return (
    <div>
      <button
        type="button"
        className={styles.button}
        aria-label={text.label}
        aria-disabled={write.pending}
        onClick={async () => {
          const answer = await write.run(() => claim(personId), { done: text.claimed });
          if (answer?.status === 409) {
            write.clear();
            announce(text.taken);
            router.refresh();
          }
        }}
      >
        {text.visible}
      </button>
      <FormError message={write.error} />
    </div>
  );
};
