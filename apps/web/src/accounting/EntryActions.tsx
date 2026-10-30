'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ConfirmAction, type ConfirmText } from '@/ui/ConfirmAction';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { deleteEntry, postEntry, reverseEntry } from './actions';

export interface EntryActionsText {
  post: string;
  posted: string;
  edit: string;
  delete: string;
  deleteText: ConfirmText;
  correct: string;
  correctHint: string;
  correctText: ConfirmText;
  errors: Readonly<Record<string, string>>;
}

/**
 * What tesorería does with an entry (accounting spec §2): a draft is posted, edited or deleted; a posted one is never
 * changed, but Corregir posts its reversal today and opens a new form with its values, so the mistake is fixed by two
 * entries the journal can explain.
 */
export const EntryActions = ({
  entryId,
  draft,
  reversible,
  text,
}: {
  entryId: string;
  draft: boolean;
  reversible: boolean;
  text: EntryActionsText;
}) => {
  const router = useRouter();
  const write = useWrite(text.errors);

  if (draft) {
    return (
      <div className={ui.rowActions}>
        <div>
          <button
            type="button"
            className={ui.button}
            aria-disabled={write.pending}
            onClick={() => void write.run(() => postEntry(entryId), { done: text.posted })}
          >
            {text.post}
          </button>
          <FormError message={write.error} />
        </div>
        <Link
          className={ui.secondaryButton}
          href={`/cuentas/nuevo?borrador=${encodeURIComponent(entryId)}`}
        >
          {text.edit}
        </Link>
        <ConfirmAction
          label={text.delete}
          text={text.deleteText}
          run={async () => {
            const answer = await deleteEntry(entryId);
            if (answer.ok) {
              router.push('/cuentas');
            }
            return answer;
          }}
        />
      </div>
    );
  }
  if (!reversible) {
    return null;
  }
  return (
    <div>
      <p className={ui.hint}>{text.correctHint}</p>
      <ConfirmAction
        label={text.correct}
        text={text.correctText}
        run={async () => {
          const answer = await reverseEntry(entryId);
          if (answer.ok) {
            router.push(`/cuentas/nuevo?desde=${encodeURIComponent(entryId)}`);
          }
          return answer;
        }}
      />
    </div>
  );
};
