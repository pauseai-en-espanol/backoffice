'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { formText } from '@/auth/client';
import { fill } from '@/fill';
import * as onboarding from '@/onboarding/styles';
import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { messageFor } from '@/write';

import { addTargets, searchContacts } from './actions';
import { ContactFlags } from './ContactItem';
import { Select } from './Field';
import { contactFiltersFromPage, NO_CONTACT_FILTERS } from './filters';
import { contactName } from './format';
import * as styles from './styles';
import {
  addedCount,
  type ContactSummary,
  ORGANISATION_KINDS,
  type OrganisationKind,
  parseContacts,
  RELATIONSHIP_STAGES,
  type RelationshipStage,
  type Tier,
  TIERS,
} from './types';

export interface AddTargetsText {
  title: string;
  intro: string;
  search: string;
  searchHint: string;
  tier: string;
  tiers: Readonly<Record<Tier, string>>;
  kind: string;
  kinds: Readonly<Record<OrganisationKind, string>>;
  stage: string;
  stages: Readonly<Record<RelationshipStage, string>>;
  any: string;
  find: string;
  resultsNone: string;
  resultsOne: string;
  /** "{count} contactos encontrados." */
  resultsMany: string;
  already: string;
  addSelected: string;
  addNone: string;
  addedNone: string;
  addedOne: string;
  /** "Se han añadido {count} contactos." */
  addedMany: string;
  /** For each contact's line. */
  inbox: string;
  anonymised: string;
  needsReview: string;
  held: string;
  private: string;
  errors: Readonly<Record<string, string>>;
}

const counted = (count: number, none: string, one: string, many: string): string =>
  count === 0 ? none : count === 1 ? one : fill(many, { count: String(count) });

/**
 * Añadir contactos (outreach spec §5): a search of the directory (the contacts on hold left out, as they never go in a
 * send set), and the ones to add, ticked. They join as pending; those already in the campaign are shown as such and
 * can't be ticked. Contacts still to review may be added: they wait in the campaign until someone reviews them.
 */
export const AddTargets = ({
  campaignId,
  inCampaign,
  text,
}: {
  campaignId: string;
  /** The contacts already in the campaign. */
  inCampaign: readonly string[];
  text: AddTargetsText;
}) => {
  const router = useRouter();
  const announce = useAnnounce();
  const [results, setResults] = useState<ContactSummary[]>();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const count = useRef<HTMLParagraphElement>(null);
  const already = new Set(inCampaign);

  useEffect(() => {
    if (results) {
      count.current?.focus();
    }
  }, [results]);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    const form = event.currentTarget;
    const filters = contactFiltersFromPage({
      buscar: formText(form, 'buscar'),
      nivel: formText(form, 'nivel'),
      tipo: formText(form, 'tipo'),
      relacion: formText(form, 'relacion'),
    });
    setPending(true);
    setError(undefined);
    // A campaign writes to team contacts only (PLAN M5, step 6): one's private ones aren't offered.
    const answer = await searchContacts({
      ...NO_CONTACT_FILTERS,
      ...filters,
      hold: 'no',
      visibility: 'team',
    });
    setPending(false);
    const contacts = answer.ok ? parseContacts(answer.body) : undefined;
    if (!contacts) {
      setError(messageFor(answer.ok ? { status: 500 } : answer, text.errors));
      return;
    }
    setChosen(new Set());
    setResults(contacts);
  };

  const add = async () => {
    if (pending) {
      return;
    }
    if (chosen.size === 0) {
      setError(text.addNone);
      return;
    }
    setPending(true);
    setError(undefined);
    const answer = await addTargets(campaignId, [...chosen]);
    setPending(false);
    if (!answer.ok) {
      setError(messageFor(answer, text.errors));
      return;
    }
    const added = addedCount(answer.body) ?? chosen.size;
    announce(counted(added, text.addedNone, text.addedOne, text.addedMany));
    setChosen(new Set());
    setResults(undefined);
    router.refresh();
  };

  return (
    <div className={ui.form}>
      <p className={ui.hint}>{text.intro}</p>
      <form method="post" className={onboarding.filters} onSubmit={search} role="search">
        <div className={ui.field} data-wide="">
          <label className={ui.label} htmlFor="anadir-buscar">
            {text.search}
          </label>
          <input
            id="anadir-buscar"
            className={ui.input}
            type="search"
            name="buscar"
            maxLength={200}
            aria-describedby="anadir-buscar-pista"
          />
          <span id="anadir-buscar-pista" className={ui.hint}>
            {text.searchHint}
          </span>
        </div>
        <Select
          id="anadir-nivel"
          name="nivel"
          label={text.tier}
          values={TIERS}
          names={text.tiers}
          empty={text.any}
        />
        <Select
          id="anadir-tipo"
          name="tipo"
          label={text.kind}
          values={ORGANISATION_KINDS}
          names={text.kinds}
          empty={text.any}
        />
        <Select
          id="anadir-relacion"
          name="relacion"
          label={text.stage}
          values={RELATIONSHIP_STAGES}
          names={text.stages}
          empty={text.any}
        />
        <div className={ui.rowActions} data-wide="">
          <button type="submit" className={ui.secondaryButton} aria-disabled={pending}>
            {text.find}
          </button>
        </div>
      </form>
      {results ? (
        <>
          <p ref={count} tabIndex={-1} className={ui.label}>
            {counted(results.length, text.resultsNone, text.resultsOne, text.resultsMany)}
          </p>
          {results.length > 0 ? (
            <fieldset className={ui.fieldset}>
              <legend className={ui.srOnly}>{text.addSelected}</legend>
              <ul className={styles.pickList}>
                {results.map((contact) => {
                  const id = `anadir-${contact.id}`;
                  const inIt = already.has(contact.id);
                  return (
                    <li key={contact.id} className={ui.checkbox}>
                      <input
                        id={id}
                        type="checkbox"
                        disabled={inIt}
                        checked={inIt || chosen.has(contact.id)}
                        onChange={(event) => {
                          const next = new Set(chosen);
                          if (event.currentTarget.checked) {
                            next.add(contact.id);
                          } else {
                            next.delete(contact.id);
                          }
                          setChosen(next);
                        }}
                      />
                      <label htmlFor={id}>
                        {contactName(contact, text)} · {contact.orgDisplay}
                        {inIt ? ` (${text.already})` : ''}
                      </label>
                      <div className={ui.checkboxHelp}>
                        <ContactFlags contact={contact} words={text} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}
          {results.length > 0 ? (
            <div>
              <button
                type="button"
                className={ui.button}
                aria-disabled={pending}
                onClick={() => void add()}
              >
                {text.addSelected}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      <FormError message={error} />
    </div>
  );
};
