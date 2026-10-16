'use client';

import { useId, useState } from 'react';

import { ConfirmAction } from '@/ui/ConfirmAction';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { removeAirtableLink, setAirtableEnabled, setAirtableLink } from '../actions';

export interface AirtableLinkText {
  link: string;
  newLink: string;
  linkHint: string;
  save: string;
  saved: string;
  invalid: string;
  turnOn: string;
  turnOff: string;
  turnedOn: string;
  turnedOff: string;
  noLinkYet: string;
  remove: string;
  removeQuestion: string;
  removed: string;
  confirm: string;
  cancel: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * The Airtable sync's controls in Ajustes, for admins (ADR-0005): paste Global's view link, which the API seals and
 * never shows again (the field empties once saved); turn the sync on or off; remove the link, asked about first, which
 * turns it off. What the state is, the page says in words above.
 */
export const AirtableLink = ({
  hasLink,
  enabled,
  text,
}: {
  hasLink: boolean;
  enabled: boolean;
  text: AirtableLinkText;
}) => {
  const save = useWrite({ ...text.errors, link: text.invalid });
  const toggle = useWrite({ ...text.errors, no_link: text.noLinkYet });
  const [link, setLink] = useState('');
  const id = useId();

  return (
    <div className={ui.form}>
      <form
        className={ui.form}
        onSubmit={async (event) => {
          event.preventDefault();
          const answer = await save.run(() => setAirtableLink(link), { done: text.saved });
          if (answer?.ok) {
            setLink('');
          }
        }}
      >
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-link`}>
            {hasLink ? text.newLink : text.link}
          </label>
          <input
            id={`${id}-link`}
            className={ui.input}
            type="url"
            name="link"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            required
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${id}-hint`}
            aria-invalid={save.refusal?.field === 'link' ? true : undefined}
          />
          <span id={`${id}-hint`} className={ui.hint}>
            {text.linkHint}
          </span>
        </div>
        <div>
          <button type="submit" className={ui.button} aria-disabled={save.pending}>
            {text.save}
          </button>
        </div>
        <FormError message={save.error} />
      </form>
      {hasLink ? (
        <div className={ui.rowActions}>
          <button
            type="button"
            className={ui.secondaryButton}
            aria-disabled={toggle.pending}
            onClick={() =>
              void toggle.run(() => setAirtableEnabled(!enabled), {
                done: enabled ? text.turnedOff : text.turnedOn,
              })
            }
          >
            {enabled ? text.turnOff : text.turnOn}
          </button>
          <ConfirmAction
            label={text.remove}
            text={{
              question: text.removeQuestion,
              confirm: text.remove,
              cancel: text.cancel,
              done: text.removed,
              errors: text.errors,
            }}
            run={removeAirtableLink}
          />
        </div>
      ) : null}
      <FormError message={toggle.error} />
    </div>
  );
};
