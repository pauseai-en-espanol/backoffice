'use client';

import { useState } from 'react';

import * as ui from '@/ui/styles';

import type { PersonPageText } from './text';

import * as styles from '../styles';
import { AttemptForm, NoteForm } from './Notes';

/**
 * What the team writes down most, in one place above the history it goes into: a contact attempt or a note, chosen
 * first. Both forms stay mounted, so switching keeps what was typed in the other.
 */
export const RecordActivity = ({ personId, text }: { personId: string; text: PersonPageText }) => {
  const t = text.record;
  const [kind, setKind] = useState<'attempt' | 'note'>('attempt');
  return (
    <div className={ui.form}>
      <fieldset className={styles.choicesRow}>
        <legend>{t.what}</legend>
        <label>
          <input
            type="radio"
            name="registrar"
            value="attempt"
            checked={kind === 'attempt'}
            onChange={() => setKind('attempt')}
          />
          {t.attempt}
        </label>
        <label>
          <input
            type="radio"
            name="registrar"
            value="note"
            checked={kind === 'note'}
            onChange={() => setKind('note')}
          />
          {t.note}
        </label>
      </fieldset>
      <div hidden={kind !== 'attempt'}>
        <AttemptForm personId={personId} text={text} />
      </div>
      <div hidden={kind !== 'note'}>
        <NoteForm personId={personId} text={text} />
      </div>
    </div>
  );
};
