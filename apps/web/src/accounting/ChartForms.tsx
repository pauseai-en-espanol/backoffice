'use client';

import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import * as onboarding from '@/onboarding/styles';
import { ConfirmAction, type ConfirmText } from '@/ui/ConfirmAction';
import { Disclosure } from '@/ui/Disclosure';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import {
  createAccount,
  createCounterparty,
  createProject,
  deleteAccount,
  deleteCounterparty,
  deleteProject,
  updateAccount,
  updateCounterparty,
  updateProject,
} from './actions';
import {
  ACCOUNT_KINDS,
  type AccountKind,
  type Counterparty,
  type LedgerAccount,
  type Project,
} from './types';

export interface ChartText {
  code: string;
  name: string;
  kind: string;
  kinds: Readonly<Record<AccountKind, string>>;
  parent: string;
  parentHint: string;
  noParent: string;
  treasury: string;
  treasuryHint: string;
  iban: string;
  ibanHint: string;
  create: string;
  addAccount: string;
  rename: string;
  save: string;
  retire: string;
  reactivate: string;
  delete: string;
  deleteText: ConfirmText;
  changed: string;
  added: string;
  person: string;
  organisation: string;
  counterpartyKind: string;
  taxId: string;
  province: string;
  addCounterparty: string;
  funder: string;
  noFunder: string;
  projectDescription: string;
  active: string;
  addProject: string;
  edit: string;
  errors: Readonly<Record<string, string>>;
}

const blank = (text: string): string | null => (text.trim() === '' ? null : text.trim());

const TextField = ({
  id,
  name,
  label,
  hint,
  defaultValue,
  maxLength,
  invalid,
  inputMode,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
  maxLength: number;
  invalid?: boolean;
  inputMode?: 'numeric';
}) => (
  <div className={ui.field}>
    <label className={ui.label} htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      name={name}
      className={ui.input}
      defaultValue={defaultValue ?? ''}
      maxLength={maxLength}
      aria-invalid={invalid}
      {...(inputMode ? { inputMode } : {})}
      {...(hint ? { 'aria-describedby': `${id}-pista` } : {})}
    />
    {hint ? (
      <span id={`${id}-pista`} className={ui.hint}>
        {hint}
      </span>
    ) : null}
  </div>
);

/** A new account: a sub-account under one without lines (a bank account under 572), or a new group of its own kind. */
export const NewAccountForm = ({
  parents,
  text,
}: {
  parents: readonly LedgerAccount[];
  text: ChartText;
}) => {
  const write = useWrite(text.errors);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const read = (name: string) => formText(form, name);
    const parentCode = blank(read('parentCode'));
    const treasury =
      (form.elements.namedItem('treasury') as HTMLInputElement | null)?.checked === true;
    const answer = await write.run(
      () =>
        createAccount({
          code: read('code').trim(),
          name: read('name'),
          parentCode,
          ...(parentCode === null ? { kind: read('kind') as AccountKind } : {}),
          treasury,
          iban: treasury ? blank(read('iban')) : null,
        }),
      { done: text.added },
    );
    if (answer?.ok) {
      form.reset();
    }
  };
  const refused = write.refusal?.field;
  return (
    <Disclosure id="nueva-cuenta" label={text.addAccount}>
      <form method="post" className={ui.form} onSubmit={submit} noValidate>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="cuenta-padre">
            {text.parent}
          </label>
          <select
            id="cuenta-padre"
            name="parentCode"
            className={onboarding.select}
            aria-describedby="cuenta-padre-pista"
          >
            <option value="">{text.noParent}</option>
            {parents.map((account) => (
              <option key={account.id} value={account.code}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
          <span id="cuenta-padre-pista" className={ui.hint}>
            {text.parentHint}
          </span>
        </div>
        <TextField
          id="cuenta-codigo"
          name="code"
          label={text.code}
          maxLength={10}
          inputMode="numeric"
          invalid={refused === 'code'}
        />
        <TextField
          id="cuenta-nombre"
          name="name"
          label={text.name}
          maxLength={120}
          invalid={refused === 'name'}
        />
        <div className={ui.field}>
          <label className={ui.label} htmlFor="cuenta-naturaleza">
            {text.kind}
          </label>
          <select
            id="cuenta-naturaleza"
            name="kind"
            className={onboarding.select}
            defaultValue="asset"
          >
            {ACCOUNT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {text.kinds[kind]}
              </option>
            ))}
          </select>
        </div>
        <label className={ui.checkbox}>
          <input type="checkbox" name="treasury" aria-describedby="cuenta-tesoreria-pista" />
          {text.treasury}
        </label>
        <span id="cuenta-tesoreria-pista" className={ui.hint}>
          {text.treasuryHint}
        </span>
        <TextField
          id="cuenta-iban"
          name="iban"
          label={text.iban}
          hint={text.ibanHint}
          maxLength={50}
          invalid={refused === 'iban'}
        />
        <FormError message={write.error} />
        <div>
          <button type="submit" className={ui.button} aria-disabled={write.pending}>
            {text.create}
          </button>
        </div>
      </form>
    </Disclosure>
  );
};

/** An account's own actions: its name, its treasury flag and IBAN (an asset), retiring it, and deleting one never used. */
export const AccountActions = ({ account, text }: { account: LedgerAccount; text: ChartText }) => {
  const write = useWrite(text.errors);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const treasury = (form.elements.namedItem('treasury') as HTMLInputElement | null)?.checked;
    await write.run(
      () =>
        updateAccount(account.id, {
          name: formText(form, 'name'),
          ...(account.kind === 'asset' && treasury !== undefined
            ? { treasury, iban: treasury ? blank(formText(form, 'iban')) : null }
            : {}),
        }),
      { done: text.changed },
    );
  };
  const id = `cuenta-${account.code}`;
  return (
    <div className={ui.rowActions}>
      <Disclosure id={`${id}-editar`} label={`${text.edit} ${account.code}`}>
        <form method="post" className={ui.form} onSubmit={submit} noValidate>
          <TextField
            id={`${id}-nombre`}
            name="name"
            label={text.name}
            defaultValue={account.name}
            maxLength={120}
          />
          {account.kind === 'asset' ? (
            <>
              <label className={ui.checkbox}>
                <input type="checkbox" name="treasury" defaultChecked={account.treasury} />
                {text.treasury}
              </label>
              <TextField
                id={`${id}-iban`}
                name="iban"
                label={text.iban}
                defaultValue={account.iban}
                maxLength={50}
              />
            </>
          ) : null}
          <FormError message={write.error} />
          <div>
            <button type="submit" className={ui.button} aria-disabled={write.pending}>
              {text.save}
            </button>
          </div>
        </form>
      </Disclosure>
      {account.yearResult ? null : (
        <button
          type="button"
          className={ui.textButton}
          aria-disabled={write.pending}
          aria-label={`${account.active ? text.retire : text.reactivate} ${account.code}`}
          onClick={() =>
            void write.run(() => updateAccount(account.id, { active: !account.active }), {
              done: text.changed,
            })
          }
        >
          {account.active ? text.retire : text.reactivate}
        </button>
      )}
      {account.used || account.group || account.yearResult ? null : (
        <ConfirmAction
          label={`${text.delete} ${account.code}`}
          short={text.delete}
          text={{
            ...text.deleteText,
            question: text.deleteText.question.replace('{code}', account.code),
          }}
          run={() => deleteAccount(account.id)}
        />
      )}
    </div>
  );
};

const CounterpartyFields = ({
  prefix,
  counterparty,
  text,
  refused,
}: {
  prefix: string;
  counterparty?: Counterparty;
  text: ChartText;
  refused: string | undefined;
}) => (
  <>
    <fieldset className={ui.fieldset}>
      <legend className={ui.label}>{text.counterpartyKind}</legend>
      <div className={onboarding.choicesRow}>
        {(['person', 'organisation'] as const).map((kind) => (
          <label key={kind} className={ui.checkbox}>
            <input
              type="radio"
              name="kind"
              value={kind}
              defaultChecked={(counterparty?.kind ?? 'person') === kind}
            />
            {text[kind]}
          </label>
        ))}
      </div>
    </fieldset>
    <TextField
      id={`${prefix}-nombre`}
      name="name"
      label={text.name}
      defaultValue={counterparty?.name}
      maxLength={200}
      invalid={refused === 'name'}
    />
    <TextField
      id={`${prefix}-nif`}
      name="taxId"
      label={text.taxId}
      defaultValue={counterparty?.taxId}
      maxLength={40}
      invalid={refused === 'taxId'}
    />
    <TextField
      id={`${prefix}-provincia`}
      name="province"
      label={text.province}
      defaultValue={counterparty?.province}
      maxLength={100}
    />
    <TextField
      id={`${prefix}-iban`}
      name="iban"
      label={text.iban}
      defaultValue={counterparty?.iban}
      maxLength={50}
      invalid={refused === 'iban'}
    />
  </>
);

const counterpartyOf = (form: HTMLFormElement) => {
  const kind =
    formText(form, 'kind') === 'organisation' ? ('organisation' as const) : ('person' as const);
  return {
    kind,
    name: formText(form, 'name'),
    taxId: blank(formText(form, 'taxId')),
    province: blank(formText(form, 'province')),
    iban: blank(formText(form, 'iban')),
  };
};

/** A counterparty: a donor's tax ID and province when they give them, which the modelo 182 will ask (D24). */
export const CounterpartyForm = ({
  counterparty,
  text,
}: {
  counterparty?: Counterparty;
  text: ChartText;
}) => {
  const write = useWrite(text.errors);
  const [prefix] = useState(counterparty ? `contraparte-${counterparty.id}` : 'contraparte-nueva');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = counterpartyOf(form);
    const answer = await write.run(
      () => (counterparty ? updateCounterparty(counterparty.id, input) : createCounterparty(input)),
      { done: counterparty ? text.changed : text.added },
    );
    if (answer?.ok && !counterparty) {
      form.reset();
    }
  };
  return (
    <div className={ui.rowActions}>
      <Disclosure
        id={`${prefix}-formulario`}
        label={counterparty ? `${text.edit}: ${counterparty.name}` : text.addCounterparty}
      >
        <form method="post" className={ui.form} onSubmit={submit} noValidate>
          <CounterpartyFields
            prefix={prefix}
            counterparty={counterparty}
            text={text}
            refused={write.refusal?.field}
          />
          <FormError message={write.error} />
          <div>
            <button type="submit" className={ui.button} aria-disabled={write.pending}>
              {counterparty ? text.save : text.create}
            </button>
          </div>
        </form>
      </Disclosure>
      {counterparty && !counterparty.used ? (
        <ConfirmAction
          label={`${text.delete}: ${counterparty.name}`}
          short={text.delete}
          text={{
            ...text.deleteText,
            question: text.deleteText.question.replace('{code}', counterparty.name),
          }}
          run={() => deleteCounterparty(counterparty.id)}
        />
      ) : null}
    </div>
  );
};

/** A project: money given for a purpose, and who gave it. */
export const ProjectForm = ({
  project,
  funders,
  text,
}: {
  project?: Project;
  funders: readonly Counterparty[];
  text: ChartText;
}) => {
  const write = useWrite(text.errors);
  const prefix = project ? `proyecto-${project.id}` : 'proyecto-nuevo';
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = {
      name: formText(form, 'name'),
      funderId: blank(formText(form, 'funderId')),
      description: blank(formText(form, 'description')),
      active: (form.elements.namedItem('active') as HTMLInputElement | null)?.checked !== false,
    };
    const answer = await write.run(
      () => (project ? updateProject(project.id, input) : createProject(input)),
      {
        done: project ? text.changed : text.added,
      },
    );
    if (answer?.ok && !project) {
      form.reset();
    }
  };
  return (
    <div className={ui.rowActions}>
      <Disclosure
        id={`${prefix}-formulario`}
        label={project ? `${text.edit}: ${project.name}` : text.addProject}
      >
        <form method="post" className={ui.form} onSubmit={submit} noValidate>
          <TextField
            id={`${prefix}-nombre`}
            name="name"
            label={text.name}
            defaultValue={project?.name}
            maxLength={120}
            invalid={write.refusal?.field === 'name'}
          />
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${prefix}-financia`}>
              {text.funder}
            </label>
            <select
              id={`${prefix}-financia`}
              name="funderId"
              className={onboarding.select}
              defaultValue={project?.funder?.id ?? ''}
            >
              <option value="">{text.noFunder}</option>
              {funders.map((funder) => (
                <option key={funder.id} value={funder.id}>
                  {funder.name}
                </option>
              ))}
            </select>
          </div>
          <TextField
            id={`${prefix}-descripcion`}
            name="description"
            label={text.projectDescription}
            defaultValue={project?.description}
            maxLength={2000}
          />
          <label className={ui.checkbox}>
            <input type="checkbox" name="active" defaultChecked={project?.active ?? true} />
            {text.active}
          </label>
          <FormError message={write.error} />
          <div>
            <button type="submit" className={ui.button} aria-disabled={write.pending}>
              {project ? text.save : text.create}
            </button>
          </div>
        </form>
      </Disclosure>
      {project && !project.used ? (
        <ConfirmAction
          label={`${text.delete}: ${project.name}`}
          short={text.delete}
          text={{
            ...text.deleteText,
            question: text.deleteText.question.replace('{code}', project.name),
          }}
          run={() => deleteProject(project.id)}
        />
      ) : null}
    </div>
  );
};
