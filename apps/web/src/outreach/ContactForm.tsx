'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

import { describedBy, formText } from '@/auth/client';
import * as onboarding from '@/onboarding/styles';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { createContact, updateContact } from './actions';
import { Field, OwnerSelect, Select } from './Field';
import { contactChange, mustStayInReview, newContact } from './forms';
import {
  type ContactDetail,
  createdId,
  RELATIONSHIP_STAGES,
  type RelationshipStage,
  type Tier,
  TIERS,
  type Treatment,
  TREATMENTS,
} from './types';
import { useDisclosure } from './useDisclosure';
import { VisibilityChoice, type VisibilityText } from './Visibility';

export interface ContactFormText {
  orgDisplay: string;
  orgDisplayHint: string;
  organisation: string;
  organisationNone: string;
  personName: string;
  personNameHint: string;
  role: string;
  treatment: string;
  treatmentHint: string;
  treatments: Readonly<Record<Treatment, string>>;
  greetingName: string;
  greetingNameHint: string;
  email: string;
  emailsExtra: string;
  emailsExtraHint: string;
  phone: string;
  phoneHint: string;
  website: string;
  territory: string;
  territoryHint: string;
  scope: string;
  sector: string;
  tier: string;
  tierHint: string;
  tiers: Readonly<Record<Tier, string>>;
  anchor: string;
  anchorHint: string;
  tags: string;
  tagsHint: string;
  stage: string;
  stages: Readonly<Record<RelationshipStage, string>>;
  owner: string;
  noOwner: string;
  reason: string;
  sources: string;
  sourcesHint: string;
  needsReview: string;
  needsReviewHint: string;
  hold: string;
  holdHint: string;
  holdReason: string;
  notes: string;
  notesWarning: string;
  /** "Quién lo ve", when it's made (PLAN M5, step 6). */
  visibility: VisibilityText;
  create: string;
  edit: string;
  save: string;
  cancel: string;
  saved: string;
  errors: Readonly<Record<string, string>>;
}

type Defaults = Partial<
  Pick<
    ContactDetail,
    | 'orgDisplay'
    | 'organisationId'
    | 'personName'
    | 'role'
    | 'treatment'
    | 'greetingName'
    | 'email'
    | 'emailsExtra'
    | 'phone'
    | 'website'
    | 'territory'
    | 'scope'
    | 'sector'
    | 'tier'
    | 'anchor'
    | 'tags'
    | 'stage'
    | 'owner'
    | 'reason'
    | 'sources'
    | 'notes'
  >
>;

/** The fields a contact's two forms share: who, where, how to address them, why they matter, who owns them. */
const ContactFields = ({
  prefix,
  defaults,
  organisations,
  owners,
  text,
  refused,
  errorId,
}: {
  prefix: string;
  defaults: Defaults;
  organisations: readonly { id: string; name: string }[];
  owners: readonly { userId: string; displayName: string }[];
  text: ContactFormText;
  /** The field the API or the page refused, by its name. */
  refused: string | undefined;
  errorId: string | undefined;
}) => {
  const orgDisplay = useRef<HTMLInputElement>(null);
  const field = (name: string) => ({
    id: `${prefix}-${name}`,
    name,
    invalid: refused === name,
    errorId: refused === name ? errorId : undefined,
  });
  return (
    <>
      <div className={ui.field}>
        <label className={ui.label} htmlFor={`${prefix}-organisationId`}>
          {text.organisation}
        </label>
        <select
          id={`${prefix}-organisationId`}
          name="organisationId"
          className={onboarding.select}
          defaultValue={defaults.organisationId ?? ''}
          onChange={(event) => {
            // A new choice fills the listing's name when it is still empty; never overwrites it.
            const chosen = organisations.find((item) => item.id === event.target.value);
            if (chosen && orgDisplay.current && orgDisplay.current.value.trim() === '') {
              orgDisplay.current.value = chosen.name;
            }
          }}
        >
          <option value="">{text.organisationNone}</option>
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.name}
            </option>
          ))}
        </select>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor={`${prefix}-orgDisplay`}>
          {text.orgDisplay}
        </label>
        <input
          ref={orgDisplay}
          id={`${prefix}-orgDisplay`}
          name="orgDisplay"
          className={ui.input}
          defaultValue={defaults.orgDisplay ?? ''}
          required
          maxLength={300}
          aria-invalid={refused === 'orgDisplay'}
          aria-describedby={describedBy(
            `${prefix}-orgDisplay-pista`,
            refused === 'orgDisplay' && errorId,
          )}
        />
        <span id={`${prefix}-orgDisplay-pista`} className={ui.hint}>
          {text.orgDisplayHint}
        </span>
      </div>
      <Field
        {...field('personName')}
        label={text.personName}
        hint={text.personNameHint}
        defaultValue={defaults.personName}
        maxLength={200}
      />
      <Field {...field('role')} label={text.role} defaultValue={defaults.role} maxLength={200} />
      <Select
        id={`${prefix}-treatment`}
        name="treatment"
        label={text.treatment}
        hint={text.treatmentHint}
        values={TREATMENTS}
        names={text.treatments}
        defaultValue={defaults.treatment ?? 'neutral'}
      />
      <Field
        {...field('greetingName')}
        label={text.greetingName}
        hint={text.greetingNameHint}
        defaultValue={defaults.greetingName}
        maxLength={200}
      />
      <Field
        {...field('email')}
        label={text.email}
        type="email"
        defaultValue={defaults.email}
        maxLength={254}
      />
      <Field
        {...field('emailsExtra')}
        label={text.emailsExtra}
        hint={text.emailsExtraHint}
        defaultValue={defaults.emailsExtra?.join('\n')}
        multiline
      />
      <Field
        {...field('phone')}
        label={text.phone}
        hint={text.phoneHint}
        type="tel"
        defaultValue={defaults.phone}
        maxLength={50}
      />
      <Field
        {...field('website')}
        label={text.website}
        type="url"
        defaultValue={defaults.website}
        maxLength={500}
      />
      <Field
        {...field('territory')}
        label={text.territory}
        hint={text.territoryHint}
        defaultValue={defaults.territory}
        maxLength={100}
      />
      <Field {...field('scope')} label={text.scope} defaultValue={defaults.scope} maxLength={50} />
      <Field
        {...field('sector')}
        label={text.sector}
        defaultValue={defaults.sector}
        maxLength={100}
      />
      <Select
        id={`${prefix}-tier`}
        name="tier"
        label={text.tier}
        hint={text.tierHint}
        values={TIERS}
        names={text.tiers}
        defaultValue={defaults.tier ?? 'B'}
      />
      <Field
        {...field('anchor')}
        label={text.anchor}
        hint={text.anchorHint}
        defaultValue={defaults.anchor}
        maxLength={60}
      />
      <Field
        {...field('tags')}
        label={text.tags}
        hint={text.tagsHint}
        defaultValue={defaults.tags?.join(', ')}
        maxLength={1600}
      />
      <Select
        id={`${prefix}-stage`}
        name="stage"
        label={text.stage}
        values={RELATIONSHIP_STAGES}
        names={text.stages}
        defaultValue={defaults.stage ?? 'identified'}
      />
      <OwnerSelect
        id={`${prefix}-ownerId`}
        label={text.owner}
        owners={owners}
        current={defaults.owner ?? null}
        none={text.noOwner}
      />
      <Field
        {...field('reason')}
        label={text.reason}
        defaultValue={defaults.reason}
        multiline
        maxLength={2000}
      />
      <Field
        {...field('sources')}
        label={text.sources}
        hint={text.sourcesHint}
        defaultValue={defaults.sources?.join('\n')}
        multiline
      />
      <Field
        {...field('notes')}
        label={text.notes}
        hint={text.notesWarning}
        defaultValue={defaults.notes}
        multiline
        maxLength={4000}
      />
    </>
  );
};

const reader = (form: HTMLFormElement) => (name: string) => formText(form, name);

/**
 * A new contact (outreach spec §1): every contact says why it matters and where that comes from; without a reason and
 * a source it stays "por revisar", and nobody may write to them until someone reviews them (checked here, and by the
 * API: 400 `reason`). The greeting is neutral unless someone has checked. Once made, their page opens.
 */
export const NewContactForm = ({
  defaults = {},
  organisations,
  owners,
  text,
}: {
  defaults?: Defaults;
  organisations: readonly { id: string; name: string }[];
  owners: readonly { userId: string; displayName: string }[];
  text: ContactFormText;
}) => {
  const router = useRouter();
  const write = useWrite(text.errors);
  const [problem, setProblem] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = newContact(reader(event.currentTarget));
    if (input.orgDisplay === '') {
      setProblem('orgDisplay');
      return;
    }
    if (!input.needsReview && mustStayInReview(input)) {
      setProblem('reason');
      return;
    }
    setProblem(undefined);
    const answer = await write.run(() => createContact(input), { refresh: false });
    const id = answer?.ok ? createdId(answer.body) : undefined;
    if (id !== undefined) {
      router.push(`/contactos/${encodeURIComponent(id)}`);
    }
  };

  const refused = problem ?? (write.refusal?.error === 'invalid' ? write.refusal.field : undefined);
  const error = problem === undefined ? write.error : text.errors[problem];
  return (
    <form method="post" className={ui.form} onSubmit={submit} noValidate>
      <ContactFields
        prefix="nuevo"
        defaults={defaults}
        organisations={organisations}
        owners={owners}
        text={text}
        refused={refused}
        errorId={error ? 'nuevo-error' : undefined}
      />
      <div className={ui.checkbox}>
        <input
          id="nuevo-needsReview"
          type="checkbox"
          name="needsReview"
          value="1"
          defaultChecked
          aria-describedby="nuevo-needsReview-pista"
        />
        <label htmlFor="nuevo-needsReview">{text.needsReview}</label>
        <span id="nuevo-needsReview-pista" className={ui.checkboxHelp}>
          {text.needsReviewHint}
        </span>
      </div>
      <div className={ui.checkbox}>
        <input
          id="nuevo-hold"
          type="checkbox"
          name="hold"
          value="1"
          aria-describedby="nuevo-hold-pista"
        />
        <label htmlFor="nuevo-hold">{text.hold}</label>
        <span id="nuevo-hold-pista" className={ui.checkboxHelp}>
          {text.holdHint}
        </span>
      </div>
      <Field id="nuevo-holdReason" name="holdReason" label={text.holdReason} maxLength={500} />
      <VisibilityChoice prefix="nuevo-quien" text={text.visibility} />
      <FormError id="nuevo-error" message={error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.create}
        </button>
      </div>
    </form>
  );
};

/** A contact's details, edited in place: only what changed is sent, an emptied field cleared. */
export const ContactEditor = ({
  contact,
  organisations,
  owners,
  text,
}: {
  contact: ContactDetail;
  organisations: readonly { id: string; name: string }[];
  owners: readonly { userId: string; displayName: string }[];
  text: ContactFormText;
}) => {
  const write = useWrite(text.errors);
  const { open, heading, opener, show, hide } = useDisclosure();
  const [problem, setProblem] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const change = contactChange(contact, reader(event.currentTarget));
    if (change.orgDisplay === '') {
      setProblem('orgDisplay');
      return;
    }
    if (
      !contact.needsReview &&
      mustStayInReview({
        reason: change.reason === undefined ? contact.reason : change.reason,
        sources: change.sources ?? contact.sources,
      })
    ) {
      setProblem('reason');
      return;
    }
    setProblem(undefined);
    if (Object.keys(change).length === 0) {
      hide();
      return;
    }
    const answer = await write.run(() => updateContact(contact.id, change), { done: text.saved });
    if (answer?.ok) {
      hide();
    }
  };

  if (!open) {
    return (
      <div>
        <button
          ref={opener}
          type="button"
          className={ui.secondaryButton}
          onClick={() => {
            write.clear();
            setProblem(undefined);
            show();
          }}
        >
          {text.edit}
        </button>
      </div>
    );
  }

  const refused = problem ?? (write.refusal?.error === 'invalid' ? write.refusal.field : undefined);
  const error = problem === undefined ? write.error : text.errors[problem];
  return (
    <form method="post" className={ui.form} onSubmit={submit} noValidate>
      <h3 ref={heading} tabIndex={-1} className={ui.h3}>
        {text.edit}
      </h3>
      <ContactFields
        prefix="editar"
        defaults={contact}
        organisations={organisations}
        owners={owners}
        text={text}
        refused={refused}
        errorId={error ? 'editar-error' : undefined}
      />
      <FormError id="editar-error" message={error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.save}
        </button>
        <button type="button" className={ui.textButton} onClick={hide}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
};
