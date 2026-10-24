'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

import * as onboarding from '@/onboarding/styles';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { messageFor } from '@/write';

import type { LetterText } from './text';

import { previewLetter, searchContacts } from './actions';
import { NO_CONTACT_FILTERS } from './filters';
import { contactName } from './format';
import { LetterView } from './LetterView';
import { type Handover, parseContacts, parseHandover } from './types';

export interface PreviewText {
  contact: string;
  choose: string;
  targets: string;
  found: string;
  search: string;
  searchButton: string;
  show: string;
  inbox: string;
  anonymised: string;
  errors: Readonly<Record<string, string>>;
}

interface Option {
  id: string;
  label: string;
}

/**
 * Vista previa (outreach spec §5): the letter a contact would get from this campaign, whether or not they're in it, to
 * check the templates and anchors. Chosen among the campaign's targets, or found in the directory. The letter is shown
 * as Siguiente shows it, without the ways to send it: letters go out from Siguiente, where sending is recorded.
 */
export const Preview = ({
  campaignId,
  targets,
  text,
  letter,
}: {
  campaignId: string;
  /** The campaign's targets' contacts. */
  targets: readonly Option[];
  text: PreviewText;
  letter: LetterText;
}) => {
  const [found, setFound] = useState<Option[]>([]);
  const [contact, setContact] = useState<string>(targets[0]?.id ?? '');
  const [shown, setShown] = useState<{ contact: string; handover: Handover }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const result = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown) {
      result.current?.focus();
    }
  }, [shown]);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q');
    if (pending || typeof q !== 'string' || q.trim() === '') {
      return;
    }
    setPending(true);
    setError(undefined);
    const answer = await searchContacts({ ...NO_CONTACT_FILTERS, q: q.trim() });
    setPending(false);
    const contacts = answer.ok ? parseContacts(answer.body) : undefined;
    if (!contacts) {
      setError(messageFor(answer.ok ? { status: 500 } : answer, text.errors));
      return;
    }
    const options = contacts.map((item) => ({
      id: item.id,
      label: `${contactName(item, text)} · ${item.orgDisplay}`,
    }));
    setFound(options);
    if (options[0]) {
      setContact(options[0].id);
    }
  };

  const show = async () => {
    if (pending || contact === '') {
      return;
    }
    setPending(true);
    setError(undefined);
    const answer = await previewLetter(campaignId, contact);
    setPending(false);
    const handover = answer.ok ? parseHandover(answer.body) : undefined;
    if (!handover) {
      setShown(undefined);
      setError(messageFor(answer.ok ? { status: 500 } : answer, text.errors));
      return;
    }
    setShown({ contact, handover });
  };

  return (
    <div className={ui.form}>
      <form method="post" className={ui.field} onSubmit={search} role="search">
        <label className={ui.label} htmlFor="vista-buscar">
          {text.search}
        </label>
        <div className={ui.rowActions}>
          <input id="vista-buscar" className={ui.input} type="search" name="q" maxLength={200} />
          <button type="submit" className={ui.secondaryButton} aria-disabled={pending}>
            {text.searchButton}
          </button>
        </div>
      </form>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="vista-contacto">
          {text.contact}
        </label>
        <select
          id="vista-contacto"
          className={onboarding.select}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
        >
          <option value="">{text.choose}</option>
          {found.length > 0 ? (
            <optgroup label={text.found}>
              {found.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {targets.length > 0 ? (
            <optgroup label={text.targets}>
              {targets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      <div>
        <button
          type="button"
          className={ui.button}
          aria-disabled={pending || contact === ''}
          onClick={() => void show()}
        >
          {text.show}
        </button>
      </div>
      <FormError message={error} />
      {shown ? (
        <div ref={result} tabIndex={-1} role="region" aria-label={letter.title}>
          <LetterView
            handover={shown.handover}
            text={letter}
            links={{
              contact: `/contactos/${encodeURIComponent(shown.contact)}`,
              campaign: `/campanas/${encodeURIComponent(campaignId)}`,
            }}
            sending={false}
          />
        </div>
      ) : null}
    </div>
  );
};
