'use client';

import { STAGES } from '@backoffice/domain/stages';
import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { useEditDone } from '@/ui/edit-done';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { StaffRef } from '../types';
import type { PersonPageText } from './text';

import { updatePerson } from '../actions';
import { happenedOnOf } from '../forms';
import * as styles from '../styles';
import { HappenedOn } from './HappenedOn';

/**
 * A person's stage (onboarding spec, stages), edited in place (EditInPlace): any stage can move to any other by hand,
 * the expected path is only a guide, so the selector offers them all, with what the chosen one means; once another is
 * chosen, the day it happened may be said, if not today (PLAN M5).
 */
export const StageForm = ({
  person,
  text,
}: {
  person: { id: string; stage: string };
  text: PersonPageText;
}) => {
  const t = text.stage;
  const write = useWrite(text.errors);
  const done = useEditDone();
  const [stage, setStage] = useState(person.stage);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stage === person.stage) {
      done?.();
      return;
    }
    const on = happenedOnOf(formText(event.currentTarget, 'happenedOn')).happenedOn;
    const answer = await write.run(
      () => updatePerson(person.id, { stage, ...(on === undefined ? {} : { stageOn: on }) }),
      { done: t.stageChanged },
    );
    if (answer?.ok) {
      done?.();
    }
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="etapa-persona">
          {t.stage}
        </label>
        <select
          id="etapa-persona"
          className={styles.select}
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          aria-describedby="etapa-persona-hint"
        >
          {STAGES.map((value) => (
            <option key={value} value={value}>
              {text.stages[value]}
            </option>
          ))}
        </select>
        <span id="etapa-persona-hint" className={ui.hint}>
          {text.stageHints[stage as keyof typeof text.stageHints] ?? ''}
        </span>
      </div>
      {stage === person.stage ? null : (
        <div className={styles.narrowField}>
          <HappenedOn id="etapa-fecha" text={text} />
        </div>
      )}
      <FormError message={write.error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.saveStage}
        </button>
        {done ? (
          <button type="button" className={ui.textButton} onClick={done}>
            {text.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
};

/**
 * A person's owner, edited in place: any active onboarder, or nobody. "Me lo quedo" sits at the top of the page
 * (ClaimButton).
 */
export const OwnerForm = ({
  person,
  team,
  text,
}: {
  person: { id: string; owner: StaffRef | null };
  team: readonly StaffRef[];
  text: PersonPageText;
}) => {
  const t = text.stage;
  const write = useWrite(text.errors);
  const done = useEditDone();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosen = new FormData(event.currentTarget).get('owner');
    const ownerId = typeof chosen === 'string' && chosen !== '' ? chosen : null;
    if (ownerId === (person.owner?.userId ?? null)) {
      done?.();
      return;
    }
    const answer = await write.run(() => updatePerson(person.id, { ownerId }), {
      done: t.ownerChanged,
    });
    if (answer?.ok) {
      done?.();
    }
  };

  // The current owner stays choosable even if they left the team since.
  const owners =
    person.owner && !team.some((member) => member.userId === person.owner?.userId)
      ? [...team, person.owner]
      : team;

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="responsable-persona">
          {t.owner}
        </label>
        <select
          id="responsable-persona"
          name="owner"
          className={styles.select}
          defaultValue={person.owner?.userId ?? ''}
        >
          <option value="">{t.noOwner}</option>
          {owners.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </select>
      </div>
      <FormError message={write.error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.saveOwner}
        </button>
        {done ? (
          <button type="button" className={ui.textButton} onClick={done}>
            {text.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
};
