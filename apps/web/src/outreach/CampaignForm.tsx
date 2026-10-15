'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { createCampaign, updateCampaign } from './actions';
import { Field, OwnerSelect, Select } from './Field';
import { campaignChange, newCampaign, SLUG } from './forms';
import { type Campaign, CAMPAIGN_STATUSES, type CampaignStatus, createdId } from './types';
import { useDisclosure } from './useDisclosure';

export interface CampaignFormText {
  name: string;
  slug: string;
  slugHint: string;
  language: string;
  languageHint: string;
  fromName: string;
  fromEmail: string;
  signature: string;
  signatureHint: string;
  goal: string;
  status: string;
  owner: string;
  noOwner: string;
  statuses: Readonly<Record<CampaignStatus, string>>;
  createTitle: string;
  create: string;
  created: string;
  edit: string;
  save: string;
  cancel: string;
  saved: string;
  errors: Readonly<Record<string, string>>;
}

const read = (form: HTMLFormElement) => (name: string) => formText(form, name);

/**
 * A new campaign (outreach spec §1): its slug (its address, for good), name, language (Spanish unless said otherwise),
 * sender and signature, and goal. Once made, its page opens, to write its templates and add its targets.
 */
export const NewCampaignForm = ({ text }: { text: CampaignFormText }) => {
  const router = useRouter();
  const announce = useAnnounce();
  const write = useWrite(text.errors);
  const [slugInvalid, setSlugInvalid] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = newCampaign(read(event.currentTarget));
    const badSlug = !SLUG.test(input.slug ?? '');
    setSlugInvalid(badSlug);
    if (badSlug) {
      return;
    }
    const answer = await write.run(() => createCampaign(input), { refresh: false });
    const id = answer?.ok ? createdId(answer.body) : undefined;
    if (id !== undefined) {
      announce(text.created);
      router.push(`/campanas/${encodeURIComponent(id)}`);
    }
  };

  const refused = write.refusal?.error === 'invalid' ? write.refusal.field : undefined;
  const error = slugInvalid ? text.errors.slug : write.error;
  return (
    <form className={ui.form} onSubmit={submit} noValidate>
      <Field
        id="campana-nombre"
        name="name"
        label={text.name}
        required
        maxLength={200}
        invalid={refused === 'name'}
        errorId={error ? 'campana-error' : undefined}
      />
      <Field
        id="campana-slug"
        name="slug"
        label={text.slug}
        hint={text.slugHint}
        required
        maxLength={80}
        invalid={slugInvalid || refused === 'slug' || write.refusal?.error === 'taken'}
        errorId={error ? 'campana-error' : undefined}
      />
      <Field
        id="campana-idioma"
        name="language"
        label={text.language}
        hint={text.languageHint}
        defaultValue="es"
        maxLength={2}
        invalid={refused === 'language'}
      />
      <Field id="campana-remitente" name="fromName" label={text.fromName} maxLength={200} />
      <Field
        id="campana-correo"
        name="fromEmail"
        label={text.fromEmail}
        type="email"
        maxLength={254}
        invalid={refused === 'fromEmail'}
      />
      <Field
        id="campana-firma"
        name="signature"
        label={text.signature}
        hint={text.signatureHint}
        multiline
        maxLength={2000}
      />
      <Field id="campana-objetivo" name="goal" label={text.goal} multiline maxLength={2000} />
      <FormError id="campana-error" message={error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.create}
        </button>
      </div>
    </form>
  );
};

/** A campaign's details, edited in place: only what changed is sent; never its slug. */
export const CampaignEditor = ({
  campaign,
  owners,
  text,
}: {
  campaign: Campaign;
  owners: readonly { userId: string; displayName: string }[];
  text: CampaignFormText;
}) => {
  const write = useWrite(text.errors);
  const { open, heading, opener, show, hide } = useDisclosure();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const change = campaignChange(campaign, read(event.currentTarget));
    if (Object.keys(change).length === 0) {
      hide();
      return;
    }
    const answer = await write.run(() => updateCampaign(campaign.id, change), {
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
            show();
          }}
        >
          {text.edit}
        </button>
      </div>
    );
  }

  const refused = write.refusal?.error === 'invalid' ? write.refusal.field : undefined;
  return (
    <form className={ui.form} onSubmit={submit} noValidate>
      <h3 ref={heading} tabIndex={-1} className={ui.h3}>
        {text.edit}
      </h3>
      <Field
        id="datos-nombre"
        name="name"
        label={text.name}
        defaultValue={campaign.name}
        required
        maxLength={200}
        invalid={refused === 'name'}
      />
      <Select
        id="datos-estado"
        name="status"
        label={text.status}
        values={CAMPAIGN_STATUSES}
        names={text.statuses}
        defaultValue={campaign.status}
      />
      <OwnerSelect
        id="datos-responsable"
        label={text.owner}
        owners={owners}
        current={campaign.owner}
        none={text.noOwner}
      />
      <Field
        id="datos-idioma"
        name="language"
        label={text.language}
        hint={text.languageHint}
        defaultValue={campaign.language}
        maxLength={2}
        invalid={refused === 'language'}
      />
      <Field
        id="datos-remitente"
        name="fromName"
        label={text.fromName}
        defaultValue={campaign.fromName}
        maxLength={200}
      />
      <Field
        id="datos-correo"
        name="fromEmail"
        label={text.fromEmail}
        type="email"
        defaultValue={campaign.fromEmail}
        maxLength={254}
        invalid={refused === 'fromEmail'}
      />
      <Field
        id="datos-firma"
        name="signature"
        label={text.signature}
        hint={text.signatureHint}
        defaultValue={campaign.signature}
        multiline
        maxLength={2000}
      />
      <Field
        id="datos-objetivo"
        name="goal"
        label={text.goal}
        defaultValue={campaign.goal}
        multiline
        maxLength={2000}
      />
      <FormError message={write.error} />
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
