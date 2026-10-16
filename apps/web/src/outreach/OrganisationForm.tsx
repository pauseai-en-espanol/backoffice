'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { createOrganisation, updateOrganisation } from './actions';
import { Field, Select } from './Field';
import { newOrganisation, organisationChange } from './forms';
import { createdId, type Organisation, ORGANISATION_KINDS, type OrganisationKind } from './types';
import { useDisclosure } from './useDisclosure';

export interface OrganisationFormText {
  name: string;
  kind: string;
  kindHint: string;
  kinds: Readonly<Record<OrganisationKind, string>>;
  territory: string;
  territoryHint: string;
  website: string;
  create: string;
  edit: string;
  save: string;
  cancel: string;
  saved: string;
  errors: Readonly<Record<string, string>>;
}

const OrganisationFields = ({
  prefix,
  organisation,
  text,
  refused,
  errorId,
}: {
  prefix: string;
  organisation?: Organisation;
  text: OrganisationFormText;
  refused: string | undefined;
  errorId: string | undefined;
}) => (
  <>
    <Field
      id={`${prefix}-nombre`}
      name="name"
      label={text.name}
      defaultValue={organisation?.name}
      required
      maxLength={200}
      invalid={refused === 'name'}
      errorId={refused === 'name' ? errorId : undefined}
    />
    <Select
      id={`${prefix}-tipo`}
      name="kind"
      label={text.kind}
      hint={text.kindHint}
      values={ORGANISATION_KINDS}
      names={text.kinds}
      defaultValue={organisation?.kind ?? 'other'}
    />
    <Field
      id={`${prefix}-territorio`}
      name="territory"
      label={text.territory}
      hint={text.territoryHint}
      defaultValue={organisation?.territory}
      maxLength={100}
    />
    <Field
      id={`${prefix}-web`}
      name="website"
      label={text.website}
      type="url"
      defaultValue={organisation?.website}
      maxLength={500}
      invalid={refused === 'website'}
      errorId={refused === 'website' ? errorId : undefined}
    />
  </>
);

/** A new organisation (outreach spec §1): its name, kind, territory and website. Once made, its page opens. */
export const NewOrganisationForm = ({ text }: { text: OrganisationFormText }) => {
  const router = useRouter();
  const write = useWrite(text.errors);
  const [missing, setMissing] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = newOrganisation((name) => formText(form, name));
    setMissing(input.name === '');
    if (input.name === '') {
      return;
    }
    const answer = await write.run(() => createOrganisation(input), { refresh: false });
    const id = answer?.ok ? createdId(answer.body) : undefined;
    if (id !== undefined) {
      router.push(`/organizaciones/${encodeURIComponent(id)}`);
    }
  };

  const refused = missing
    ? 'name'
    : write.refusal?.error === 'invalid'
      ? write.refusal.field
      : undefined;
  const error = missing ? text.errors.name : write.error;
  return (
    <form className={ui.form} onSubmit={submit} noValidate>
      <OrganisationFields
        prefix="organizacion"
        text={text}
        refused={refused}
        errorId={error ? 'organizacion-error' : undefined}
      />
      <FormError id="organizacion-error" message={error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.create}
        </button>
      </div>
    </form>
  );
};

/** An organisation's details, edited in place: only what changed is sent. */
export const OrganisationEditor = ({
  organisation,
  text,
}: {
  organisation: Organisation;
  text: OrganisationFormText;
}) => {
  const write = useWrite(text.errors);
  const { open, heading, opener, show, hide } = useDisclosure();
  const [missing, setMissing] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const change = organisationChange(organisation, (name) => formText(form, name));
    setMissing(change.name === '');
    if (change.name === '') {
      return;
    }
    if (Object.keys(change).length === 0) {
      hide();
      return;
    }
    const answer = await write.run(() => updateOrganisation(organisation.id, change), {
      done: text.saved,
    });
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
            setMissing(false);
            show();
          }}
        >
          {text.edit}
        </button>
      </div>
    );
  }

  const refused = missing
    ? 'name'
    : write.refusal?.error === 'invalid'
      ? write.refusal.field
      : undefined;
  const error = missing ? text.errors.name : write.error;
  return (
    <form className={ui.form} onSubmit={submit} noValidate>
      <h3 ref={heading} tabIndex={-1} className={ui.h3}>
        {text.edit}
      </h3>
      <OrganisationFields
        prefix="editar-organizacion"
        organisation={organisation}
        text={text}
        refused={refused}
        errorId={error ? 'editar-organizacion-error' : undefined}
      />
      <FormError id="editar-organizacion-error" message={error} />
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
