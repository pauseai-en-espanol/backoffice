'use client';

import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { ConfirmAction } from '@/ui/ConfirmAction';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { removeTarget, updateTarget } from './actions';
import { Field, OwnerSelect, Select } from './Field';
import { targetChange } from './forms';
import { type Target, TARGET_STATUSES, type TargetStatus } from './types';
import { useDisclosure } from './useDisclosure';

export interface TargetActionsText {
  statuses: Readonly<Record<TargetStatus, string>>;
  status: string;
  owner: string;
  noOwner: string;
  priority: string;
  priorityHint: string;
  anchor: string;
  anchorOfContact: string;
  nextAction: string;
  nextActionDue: string;
  notes: string;
  notesWarning: string;
  /** "Cambiar: {name}", filled by the page. */
  edit: string;
  save: string;
  saved: string;
  cancel: string;
  /** "Quitar de la campaña: {name}", filled by the page. */
  remove: string;
  /** "¿Quitar a {name} de la campaña?…", filled by the page. */
  removeQuestion: string;
  removeConfirm: string;
  removed: string;
  errors: Readonly<Record<string, string>>;
}

/** The statuses a target may still be taken out of the campaign in: nobody has written to them yet. */
const REMOVABLE: readonly TargetStatus[] = ['pending', 'ready', 'skip'];

/**
 * A target's changes in place (outreach spec §2): its status, owner, priority, evidence paragraph, next action and
 * notes; only what changed is sent. Made ready or sent while the contact needs review or is held, the API refuses it
 * (409 needsReview), said in words. While nobody has written to them, the target can be taken out of the campaign,
 * asked first.
 */
export const TargetActions = ({
  target,
  anchors,
  owners,
  text,
}: {
  target: Target;
  anchors: readonly { key: string; label: string }[];
  owners: readonly { userId: string; displayName: string }[];
  text: TargetActionsText;
}) => {
  const write = useWrite(text.errors);
  const { open, heading, opener, show, hide } = useDisclosure();
  const [badPriority, setBadPriority] = useState(false);
  const id = `destinatario-${target.id}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const change = targetChange(target, (name) => formText(form, name));
    setBadPriority(change === undefined);
    if (change === undefined) {
      return;
    }
    if (Object.keys(change).length === 0) {
      hide();
      return;
    }
    const answer = await write.run(() => updateTarget(target.id, change), { done: text.saved });
    if (answer?.ok) {
      hide();
    }
  };

  // A key the campaign no longer has stays choosable, so saving doesn't drop it unasked.
  const anchorKeys =
    target.anchor !== null && !anchors.some((anchor) => anchor.key === target.anchor)
      ? [...anchors, { key: target.anchor, label: target.anchor }]
      : anchors;
  const error = badPriority ? text.errors.priority : write.error;

  return (
    <div className={ui.form}>
      {open ? (
        <form method="post" className={ui.form} onSubmit={submit} noValidate>
          <h4 ref={heading} tabIndex={-1} className={ui.h3}>
            {text.edit}
          </h4>
          <Select
            id={`${id}-estado`}
            name="status"
            label={text.status}
            values={TARGET_STATUSES}
            names={text.statuses}
            defaultValue={target.status}
          />
          <OwnerSelect
            id={`${id}-responsable`}
            label={text.owner}
            owners={owners}
            current={target.owner}
            none={text.noOwner}
          />
          <Field
            id={`${id}-prioridad`}
            name="priority"
            label={text.priority}
            hint={text.priorityHint}
            type="number"
            defaultValue={target.priority}
            invalid={badPriority}
            errorId={error ? `${id}-error` : undefined}
          />
          <Select
            id={`${id}-parrafo`}
            name="anchor"
            label={text.anchor}
            values={anchorKeys.map((anchor) => anchor.key)}
            names={Object.fromEntries(
              anchorKeys.map((anchor) => [anchor.key, `${anchor.label} (${anchor.key})`]),
            )}
            defaultValue={target.anchor ?? ''}
            empty={text.anchorOfContact}
          />
          <Field
            id={`${id}-paso`}
            name="nextAction"
            label={text.nextAction}
            defaultValue={target.nextAction}
            maxLength={300}
          />
          <Field
            id={`${id}-fecha`}
            name="nextActionDue"
            label={text.nextActionDue}
            type="date"
            defaultValue={target.nextActionDue}
          />
          <Field
            id={`${id}-notas`}
            name="notes"
            label={text.notes}
            hint={text.notesWarning}
            defaultValue={target.notes}
            multiline
            maxLength={4000}
          />
          <FormError id={`${id}-error`} message={error} />
          <div className={ui.rowActions}>
            <button type="submit" className={ui.button} aria-disabled={write.pending}>
              {text.save}
            </button>
            <button type="button" className={ui.textButton} onClick={hide}>
              {text.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className={ui.rowActions}>
          <button
            ref={opener}
            type="button"
            className={ui.secondaryButton}
            onClick={() => {
              write.clear();
              setBadPriority(false);
              show();
            }}
          >
            {text.edit}
          </button>
          {REMOVABLE.includes(target.status) ? (
            <ConfirmAction
              label={text.remove}
              text={{
                question: text.removeQuestion,
                confirm: text.removeConfirm,
                cancel: text.cancel,
                done: text.removed,
                errors: text.errors,
              }}
              run={() => removeTarget(target.id)}
            />
          ) : null}
        </div>
      )}
      {open ? null : <FormError message={write.error} />}
    </div>
  );
};
