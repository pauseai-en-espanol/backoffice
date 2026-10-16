'use client';

import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { handOverPrivate } from './actions';

export interface HandOverText {
  heir: string;
  heirHint: string;
  heirNone: string;
  handOver: string;
  handedOver: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * Who inherits a departed member's private outreach records (PLAN M5, step 6): an admin chooses someone active in
 * outreach, or an admin, who then sees them as their owner did. The admin never sees what they are, only how many
 * (the page's line above).
 */
export const HandOver = ({
  userId,
  heirs,
  text,
}: {
  userId: string;
  heirs: readonly { userId: string; displayName: string }[];
  text: HandOverText;
}) => {
  const write = useWrite(text.errors);
  const [chosen, setChosen] = useState(heirs[0]?.userId ?? '');

  if (heirs.length === 0) {
    return <p className={ui.hint}>{text.heirNone}</p>;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const to = formText(event.currentTarget, 'heir');
    await write.run(() => handOverPrivate(userId, to), { done: text.handedOver });
  };

  const id = `heredero-${userId}`;
  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor={id}>
          {text.heir}
        </label>
        <select
          id={id}
          name="heir"
          className={ui.input}
          value={chosen}
          onChange={(event) => setChosen(event.currentTarget.value)}
          aria-describedby={`${id}-pista`}
        >
          {heirs.map((heir) => (
            <option key={heir.userId} value={heir.userId}>
              {heir.displayName}
            </option>
          ))}
        </select>
        <span id={`${id}-pista`} className={ui.hint}>
          {text.heirHint}
        </span>
      </div>
      <FormError message={write.error} />
      <div>
        <button type="submit" className={ui.secondaryButton} aria-disabled={write.pending}>
          {text.handOver}
        </button>
      </div>
    </form>
  );
};
