'use client';

import { STAGES } from '@backoffice/domain/stages';
import { type FormEvent, useState } from 'react';

import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { StaffRef } from '../types';
import type { PersonPageText } from './text';

import { updatePerson } from '../actions';
import * as styles from '../styles';

/**
 * A person's stage and owner (onboarding spec, stages): any stage can move to any other by hand, the expected path is
 * only a guide, so the selector offers them all, with what the chosen one means. The owner is any active onboarder, or
 * nobody. "Me lo quedo" sits by the owner line at the top of the page (ClaimButton).
 */
export const StageOwner = ({
  person,
  team,
  text,
}: {
  person: { id: string; name: string; stage: string; owner: StaffRef | null };
  team: readonly StaffRef[];
  text: PersonPageText;
}) => {
  const t = text.stage;
  const stageWrite = useWrite(text.errors);
  const ownerWrite = useWrite(text.errors);
  const [stage, setStage] = useState(person.stage);

  const saveStage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stage !== person.stage) {
      await stageWrite.run(() => updatePerson(person.id, { stage }), { done: t.stageChanged });
    }
  };

  const saveOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosen = new FormData(event.currentTarget).get('owner');
    const ownerId = typeof chosen === 'string' && chosen !== '' ? chosen : null;
    if (ownerId !== (person.owner?.userId ?? null)) {
      await ownerWrite.run(() => updatePerson(person.id, { ownerId }), { done: t.ownerChanged });
    }
  };

  // The current owner stays choosable even if they left the team since.
  const owners =
    person.owner && !team.some((member) => member.userId === person.owner?.userId)
      ? [...team, person.owner]
      : team;

  return (
    <>
      <form className={ui.form} onSubmit={saveStage}>
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
        <FormError message={stageWrite.error} />
        <div>
          <button type="submit" className={ui.button} aria-disabled={stageWrite.pending}>
            {t.saveStage}
          </button>
        </div>
      </form>
      <form className={ui.form} onSubmit={saveOwner}>
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
        <FormError message={ownerWrite.error} />
        <div>
          <button type="submit" className={ui.secondaryButton} aria-disabled={ownerWrite.pending}>
            {t.saveOwner}
          </button>
        </div>
      </form>
    </>
  );
};
