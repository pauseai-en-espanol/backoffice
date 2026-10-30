'use client';

import { type KeyboardEvent, useState } from 'react';

import { describedBy } from '@/auth/client';
import { Disclosure } from '@/ui/Disclosure';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { createCounterparty } from './actions';
import { createdId } from './types';

export interface QuickCounterpartyText {
  title: string;
  name: string;
  kind: string;
  person: string;
  organisation: string;
  taxId: string;
  province: string;
  donorHint: string;
  add: string;
  added: string;
  errors: Readonly<Record<string, string>>;
}

const blank = (text: string): string | null => (text.trim() === '' ? null : text.trim());

/**
 * A counterparty added from Nuevo movimiento, without going to Plan de cuentas: its name, whether a person or an
 * organisation, and for an income the NIF and province a donor gives (D24). Inside the entry's form, so not a form
 * itself: its button, or Enter in its fields, adds it, and the movement's Contraparte takes it.
 */
export const QuickCounterparty = ({
  income,
  text,
  onAdded,
}: {
  income: boolean;
  text: QuickCounterpartyText;
  onAdded: (counterparty: { id: string; name: string }) => void;
}) => {
  const write = useWrite(text.errors);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'person' | 'organisation'>('person');
  const [taxId, setTaxId] = useState('');
  const [province, setProvince] = useState('');
  const [missing, setMissing] = useState(false);

  const add = async () => {
    setMissing(name.trim() === '');
    if (name.trim() === '') {
      return;
    }
    const answer = await write.run(
      () =>
        createCounterparty({
          kind,
          name: name.trim(),
          taxId: income ? blank(taxId) : null,
          province: income ? blank(province) : null,
          iban: null,
        }),
      { done: text.added, refresh: false },
    );
    const id = answer?.ok ? createdId(answer.body) : undefined;
    if (id !== undefined) {
      onAdded({ id, name: name.trim() });
      setName('');
      setTaxId('');
      setProvince('');
    }
  };

  // Enter adds the counterparty, never posts the movement around it.
  const enter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void add();
    }
  };

  const refused = missing ? 'name' : (write.refusal?.field ?? (write.refusal ? 'name' : undefined));
  const error = missing ? text.errors.name : write.error;
  const errorId = error ? 'contraparte-rapida-error' : undefined;
  return (
    <Disclosure id="contraparte-rapida" label={text.title}>
      {/* Boxed, so its fields don't read as the movement's own. */}
      <div role="group" aria-label={text.title} className={ui.card}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="contraparte-rapida-nombre">
            {text.name}
          </label>
          <input
            id="contraparte-rapida-nombre"
            className={ui.input}
            value={name}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={enter}
            aria-invalid={refused === 'name'}
            aria-describedby={describedBy(refused === 'name' && errorId)}
          />
        </div>
        <fieldset className={ui.fieldset}>
          <legend className={ui.label}>{text.kind}</legend>
          {(['person', 'organisation'] as const).map((each) => (
            <label key={each} className={ui.checkbox}>
              <input
                type="radio"
                name="contraparte-rapida-tipo"
                value={each}
                checked={kind === each}
                onChange={() => setKind(each)}
              />
              {text[each]}
            </label>
          ))}
        </fieldset>
        {income ? (
          <>
            <p id="contraparte-rapida-pista" className={ui.hint}>
              {text.donorHint}
            </p>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contraparte-rapida-nif">
                {text.taxId}
              </label>
              <input
                id="contraparte-rapida-nif"
                className={ui.input}
                value={taxId}
                maxLength={40}
                autoComplete="off"
                onChange={(event) => setTaxId(event.target.value)}
                onKeyDown={enter}
                aria-invalid={refused === 'taxId'}
                aria-describedby={describedBy(
                  'contraparte-rapida-pista',
                  refused === 'taxId' && errorId,
                )}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="contraparte-rapida-provincia">
                {text.province}
              </label>
              <input
                id="contraparte-rapida-provincia"
                className={ui.input}
                value={province}
                maxLength={100}
                autoComplete="off"
                onChange={(event) => setProvince(event.target.value)}
                onKeyDown={enter}
                aria-describedby="contraparte-rapida-pista"
              />
            </div>
          </>
        ) : null}
        <FormError id="contraparte-rapida-error" message={error} />
        <div>
          <button
            type="button"
            className={ui.secondaryButton}
            aria-disabled={write.pending}
            onClick={() => void add()}
          >
            {text.add}
          </button>
        </div>
      </div>
    </Disclosure>
  );
};
