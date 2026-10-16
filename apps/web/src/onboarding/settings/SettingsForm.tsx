'use client';

import { type FormEvent } from 'react';

import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { Settings } from '../types';

import { updateSettings } from '../actions';
import { fieldsOf, SETTINGS_NUMBERS, settingsChange } from '../forms';
import * as styles from '../styles';

export interface SettingsText {
  followUpDays: string;
  unresponsiveAttempts: string;
  unresponsiveDays: string;
  unassignedAlertHours: string;
  matchThreshold: string;
  matchThresholdHint: string;
  teamPostDays: string;
  teamPostDaysHint: string;
  communityChats: string;
  communityChatsHint: string;
  save: string;
  saved: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * The onboarding settings (onboarding spec: thresholds live in settings, not in code), which admins change: when
 * someone needs a follow-up or is unresponsive, when the unassigned are flagged, how alike two names must be to be a
 * possible duplicate, and the community's chats. The database checks each value's bounds again.
 */
/** The settings that carry a hint under their field, and its text's key. */
const HINTS = { matchThreshold: 'matchThresholdHint', teamPostDays: 'teamPostDaysHint' } as const;

export const SettingsForm = ({ settings, text }: { settings: Settings; text: SettingsText }) => {
  const write = useWrite(text.errors);
  const invalid = write.refusal?.error === 'invalid' ? write.refusal.field : undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const change = settingsChange(settings, fieldsOf(event.currentTarget));
    if (Object.keys(change).length > 0) {
      await write.run(() => updateSettings(change), { done: text.saved });
    }
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      {SETTINGS_NUMBERS.map(([key, min, max, step]) => (
        <div key={key} className={ui.field}>
          <label className={ui.label} htmlFor={`ajuste-${key}`}>
            {text[key]}
          </label>
          <input
            id={`ajuste-${key}`}
            className={ui.input}
            type="number"
            name={key}
            min={min}
            max={max}
            step={step}
            defaultValue={settings[key]}
            required
            inputMode={step < 1 ? 'decimal' : 'numeric'}
            aria-invalid={invalid === key}
            aria-describedby={key in HINTS ? `ajuste-${key}-hint` : undefined}
          />
          {key === 'matchThreshold' || key === 'teamPostDays' ? (
            <span id={`ajuste-${key}-hint`} className={ui.hint}>
              {text[HINTS[key]]}
            </span>
          ) : null}
        </div>
      ))}
      <div className={ui.field}>
        <label className={ui.label} htmlFor="ajuste-chats">
          {text.communityChats}
        </label>
        <textarea
          id="ajuste-chats"
          name="communityChats"
          className={styles.textarea}
          defaultValue={settings.communityChats.join('\n')}
          aria-describedby="ajuste-chats-hint"
          aria-invalid={invalid === 'communityChats'}
        />
        <span id="ajuste-chats-hint" className={ui.hint}>
          {text.communityChatsHint}
        </span>
      </div>
      <FormError message={write.error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.save}
        </button>
      </div>
    </form>
  );
};
