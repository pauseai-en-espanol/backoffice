'use client';

import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { fill } from '@/fill';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';
import { messageFor } from '@/write';

import type { PersonSummary } from './types';

import { decide, searchPeople } from './actions';
import { personName } from './names';
import * as styles from './styles';
import { parsePeople } from './types';

export interface BandejaSearchText {
  label: string;
  hint: string;
  button: string;
  none: string;
  /** "Es {name}" */
  attachTo: string;
  noName: string;
  stages: Readonly<Record<string, string>>;
  done: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * When the one a record is isn't among its candidates (PLAN R60): search by name, phone, email or Discord username, as
 * Personas does, and attach it to whoever is found. Never for a census answer, which goes only to its candidates.
 */
export const BandejaSearch = ({ itemId, text }: { itemId: string; text: BandejaSearchText }) => {
  const write = useWrite(text.errors);
  const [results, setResults] = useState<PersonSummary[]>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const field = `bandeja-buscar-${itemId}`;

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = formText(event.currentTarget, 'q').trim();
    if (q === '' || searching) {
      return;
    }
    setSearching(true);
    setError(undefined);
    const answer = await searchPeople(q);
    setSearching(false);
    const page = answer.ok ? parsePeople(answer.body) : undefined;
    if (!page) {
      setError(messageFor(answer.ok ? { status: 500 } : answer, text.errors));
      return;
    }
    setResults(page.people);
  };

  return (
    <div className={ui.form}>
      <form method="post" className={ui.field} onSubmit={search} role="search">
        <label className={ui.label} htmlFor={field}>
          {text.label}
        </label>
        <div className={styles.searchRow}>
          <input
            id={field}
            className={ui.input}
            type="search"
            name="q"
            maxLength={200}
            aria-describedby={`${field}-pista`}
          />
          <button type="submit" className={ui.secondaryButton} aria-disabled={searching}>
            {text.button}
          </button>
        </div>
        <span id={`${field}-pista`} className={ui.hint}>
          {text.hint}
        </span>
      </form>
      <div role="status">
        {results !== undefined && results.length === 0 ? <p>{text.none}</p> : null}
      </div>
      {results !== undefined && results.length > 0 ? (
        <ul className={styles.foundList}>
          {results.map((found) => {
            const name = personName(found.name, text.noName);
            return (
              <li key={found.id}>
                <span>
                  {name}
                  {found.province ? ` (${found.province})` : ''} · {text.stages[found.stage]}
                </span>
                <button
                  type="button"
                  className={ui.secondaryButton}
                  aria-disabled={write.pending}
                  onClick={() =>
                    void write.run(() => decide(itemId, { decision: 'attach', target: found.id }), {
                      done: text.done,
                    })
                  }
                >
                  {fill(text.attachTo, { name })}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <FormError message={error ?? write.error} />
    </div>
  );
};
