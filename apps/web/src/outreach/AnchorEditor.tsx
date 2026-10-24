'use client';

import { type FormEvent, type RefObject, useState } from 'react';

import { formText } from '@/auth/client';
import { fill } from '@/fill';
import * as onboarding from '@/onboarding/styles';
import { ConfirmAction } from '@/ui/ConfirmAction';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { Anchor } from './types';

import { deleteAnchor, saveAnchor } from './actions';
import { Field } from './Field';
import { ANCHOR_KEY, anchorInput } from './forms';
import * as styles from './styles';
import { useDisclosure } from './useDisclosure';

export interface AnchorText {
  none: string;
  key: string;
  keyHint: string;
  keyTaken: string;
  label: string;
  text: string;
  sources: string;
  sourcesHint: string;
  add: string;
  save: string;
  saved: string;
  /** "Editar: {label}" */
  edit: string;
  /** "Borrar: {label}" */
  remove: string;
  /** "¿Borrar el párrafo «{label}»?…" */
  removeQuestion: string;
  removeConfirm: string;
  removed: string;
  cancel: string;
  errors: Readonly<Record<string, string>>;
}

/** What a paragraph's form checks before sending: a label, a text and at least one source (outreach spec §3). */
const missing = (input: { label: string; text: string; sources: readonly string[] }) =>
  input.label === ''
    ? 'label'
    : input.text === ''
      ? 'text'
      : input.sources.length === 0
        ? 'sources'
        : undefined;

/** A paragraph's form, to add one (`anchor` undefined: its key is chosen here) or edit one (its key stays). */
const AnchorForm = ({
  campaignId,
  anchor,
  taken,
  text,
  idPrefix,
  title,
  done,
  heading,
}: {
  campaignId: string;
  anchor?: Anchor;
  taken: readonly string[];
  text: AnchorText;
  idPrefix: string;
  title: string;
  done: () => void;
  heading: RefObject<HTMLHeadingElement | null>;
}) => {
  const write = useWrite(text.errors);
  const [problem, setProblem] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const read = (name: string) => formText(form, name);
    const key = anchor?.key ?? read('key').trim();
    const input = anchorInput(read);
    const field = !ANCHOR_KEY.test(key) ? 'key' : missing(input);
    if (field !== undefined) {
      setProblem(text.errors[field]);
      return;
    }
    if (anchor === undefined && taken.includes(key)) {
      setProblem(text.keyTaken);
      return;
    }
    setProblem(undefined);
    const answer = await write.run(() => saveAnchor(campaignId, key, input), { done: text.saved });
    if (answer?.ok) {
      done();
    }
  };

  const error = problem ?? write.error;
  const errorId = error ? `${idPrefix}-error` : undefined;
  return (
    <form method="post" className={ui.form} onSubmit={submit} noValidate>
      <h4 ref={heading} tabIndex={-1} className={ui.h3}>
        {title}
      </h4>
      {anchor === undefined ? (
        <Field
          id={`${idPrefix}-clave`}
          name="key"
          label={text.key}
          hint={text.keyHint}
          required
          maxLength={60}
          errorId={errorId}
        />
      ) : null}
      <Field
        id={`${idPrefix}-nombre`}
        name="label"
        label={text.label}
        defaultValue={anchor?.label}
        required
        maxLength={200}
        errorId={errorId}
      />
      <Field
        id={`${idPrefix}-texto`}
        name="text"
        label={text.text}
        defaultValue={anchor?.text}
        required
        multiline
        maxLength={4000}
        errorId={errorId}
      />
      <Field
        id={`${idPrefix}-fuentes`}
        name="sources"
        label={text.sources}
        hint={text.sourcesHint}
        defaultValue={anchor?.sources.join('\n')}
        required
        multiline
        errorId={errorId}
      />
      <FormError id={`${idPrefix}-error`} message={error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.save}
        </button>
        <button type="button" className={ui.textButton} onClick={done}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
};

/** One paragraph: its words and sources, edited in place, or deleted once nothing names it (409 inUse otherwise). */
const AnchorItem = ({
  campaignId,
  anchor,
  text,
}: {
  campaignId: string;
  anchor: Anchor;
  text: AnchorText;
}) => {
  const { open, heading, opener, show, hide } = useDisclosure();
  const idPrefix = `parrafo-${anchor.key}`;
  return (
    <li className={onboarding.personItem}>
      <p>
        <strong>{anchor.label}</strong> <span className={ui.muted}>({anchor.key})</span>
      </p>
      <div className={styles.template}>{anchor.text}</div>
      <ul className={styles.bullets}>
        {anchor.sources.map((source) => (
          <li key={source}>{source}</li>
        ))}
      </ul>
      {open ? (
        <AnchorForm
          campaignId={campaignId}
          anchor={anchor}
          taken={[]}
          text={text}
          idPrefix={idPrefix}
          title={fill(text.edit, { label: anchor.label })}
          done={hide}
          heading={heading}
        />
      ) : (
        <div className={ui.rowActions}>
          <button ref={opener} type="button" className={ui.secondaryButton} onClick={show}>
            {fill(text.edit, { label: anchor.label })}
          </button>
          <ConfirmAction
            label={fill(text.remove, { label: anchor.label })}
            text={{
              question: fill(text.removeQuestion, { label: anchor.label }),
              confirm: text.removeConfirm,
              cancel: text.cancel,
              done: text.removed,
              errors: text.errors,
            }}
            run={() => deleteAnchor(campaignId, anchor.key)}
          />
        </div>
      )}
    </li>
  );
};

/**
 * A campaign's evidence paragraphs (outreach spec §1, §3): each dropped into a letter as `{{anchor}}`, chosen by its key
 * on the target or the contact, and every one with at least one source. Listed, edited, added and deleted in place.
 */
export const AnchorEditor = ({
  campaignId,
  anchors,
  text,
}: {
  campaignId: string;
  anchors: readonly Anchor[];
  text: AnchorText;
}) => {
  const { open, heading, opener, show, hide } = useDisclosure();
  return (
    <div className={ui.form}>
      {anchors.length === 0 ? (
        <p className={ui.hint}>{text.none}</p>
      ) : (
        <ul className={onboarding.personList}>
          {anchors.map((anchor) => (
            <AnchorItem key={anchor.key} campaignId={campaignId} anchor={anchor} text={text} />
          ))}
        </ul>
      )}
      {open ? (
        <AnchorForm
          campaignId={campaignId}
          taken={anchors.map((anchor) => anchor.key)}
          text={text}
          idPrefix="parrafo-nuevo"
          title={text.add}
          done={hide}
          heading={heading}
        />
      ) : (
        <div>
          <button ref={opener} type="button" className={ui.secondaryButton} onClick={show}>
            {text.add}
          </button>
        </div>
      )}
    </div>
  );
};
