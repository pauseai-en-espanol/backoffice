'use client';

import { ConfirmAction } from '@/ui/ConfirmAction';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { decide } from './actions';

export interface BandejaActionsText {
  /** "Es {name}", filled by the page for each candidate. */
  attachTo: { personId: string; label: string }[];
  isNew: string;
  discard: string;
  discardConfirm: string;
  apply: string;
  keep: string;
  confirm: string;
  cancel: string;
  done: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * A decision on a record in the Bandeja (onboarding spec, matching): a possible duplicate is one of its candidates,
 * someone new, or discarded (after a question); disagreeing values are applied to the person or the person's kept.
 * Nothing in the Bandeja is ever applied by itself.
 */
export const BandejaActions = ({
  itemId,
  status,
  text,
}: {
  itemId: string;
  status: 'review' | 'conflict';
  text: BandejaActionsText;
}) => {
  const write = useWrite(text.errors);
  const run = (decision: Parameters<typeof decide>[1]) =>
    void write.run(() => decide(itemId, decision), { done: text.done });

  return (
    <div>
      <div className={ui.rowActions}>
        {status === 'review' ? (
          <>
            {text.attachTo.map((candidate) => (
              <button
                key={candidate.personId}
                type="button"
                className={ui.button}
                aria-disabled={write.pending}
                onClick={() => run({ decision: 'attach', target: candidate.personId })}
              >
                {candidate.label}
              </button>
            ))}
            <button
              type="button"
              className={ui.secondaryButton}
              aria-disabled={write.pending}
              onClick={() => run({ decision: 'new' })}
            >
              {text.isNew}
            </button>
            <ConfirmAction
              label={text.discard}
              text={{
                question: text.discardConfirm,
                confirm: text.confirm,
                cancel: text.cancel,
                done: text.done,
                errors: text.errors,
              }}
              run={() => decide(itemId, { decision: 'discard' })}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              className={ui.button}
              aria-disabled={write.pending}
              onClick={() => run({ decision: 'apply' })}
            >
              {text.apply}
            </button>
            <button
              type="button"
              className={ui.secondaryButton}
              aria-disabled={write.pending}
              onClick={() => run({ decision: 'keep' })}
            >
              {text.keep}
            </button>
          </>
        )}
      </div>
      <FormError message={write.error} />
    </div>
  );
};
