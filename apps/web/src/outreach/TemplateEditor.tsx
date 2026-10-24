'use client';

import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { fill } from '@/fill';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { saveTemplate } from './actions';
import { Field } from './Field';
import { unknownMergeFields } from './format';
import { templateInput } from './forms';
import * as styles from './styles';
import { refusedFields, type Template, type Tier } from './types';
import { useDisclosure } from './useDisclosure';

export interface TemplateText {
  /** "Nivel {tier}" */
  tierTitle: string;
  none: string;
  subject: string;
  body: string;
  maxWords: string;
  maxWordsHint: string;
  sources: string;
  sourcesHint: string;
  notes: string;
  noSources: string;
  /** "Editar la plantilla del nivel {tier}" */
  edit: string;
  /** "Escribir la plantilla del nivel {tier}" */
  write: string;
  save: string;
  saved: string;
  cancel: string;
  /** "Estos campos no se pueden usar: {fields}…" */
  unknownFields: string;
  errors: Readonly<Record<string, string>>;
}

const fieldList = (fields: readonly string[]) => fields.map((field) => `{{${field}}}`).join(', ');

/**
 * One tier's template (outreach spec §3): its subject and body as written, `{{fields}}` and all, its word limit, the
 * sources of the claims it makes, notes for the sender, and its version (a sent letter records the one it came from).
 * Edited in place and saved whole. A field that isn't a merge field would fail every letter, so it is refused here
 * first, and by the API (400 with `fields`), each named.
 */
export const TemplateEditor = ({
  campaignId,
  tier,
  template,
  version,
  text,
}: {
  campaignId: string;
  tier: Tier;
  template: Template | null;
  /** "Versión 3, del 15 de octubre de 2026", worded by the page. */
  version: string | null;
  text: TemplateText;
}) => {
  const write = useWrite(text.errors);
  const { open, heading, opener, show, hide } = useDisclosure();
  const [refusal, setRefusal] = useState<string>();
  const id = `plantilla-${tier}`;
  const edit = fill(template ? text.edit : text.write, { tier });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = templateInput((name) => formText(form, name));
    if (input === undefined) {
      setRefusal(text.errors.maxWords);
      return;
    }
    const unknown = unknownMergeFields(input.subject, input.body);
    if (unknown.length > 0) {
      setRefusal(fill(text.unknownFields, { fields: fieldList(unknown) }));
      return;
    }
    setRefusal(undefined);
    const answer = await write.run(() => saveTemplate(campaignId, tier, input), {
      done: text.saved,
    });
    if (answer?.ok) {
      hide();
      return;
    }
    const fields = answer ? refusedFields(answer.body) : [];
    if (fields.length > 0) {
      write.clear();
      setRefusal(fill(text.unknownFields, { fields: fieldList(fields) }));
    }
  };

  const error = refusal ?? write.error;
  return (
    <div className={ui.form}>
      <h3 className={ui.h3}>{fill(text.tierTitle, { tier })}</h3>
      {template ? (
        <>
          {version ? <p className={ui.hint}>{version}</p> : null}
          <dl className={ui.facts}>
            <dt>{text.subject}</dt>
            <dd>{template.subject}</dd>
            {template.maxWords === null ? null : (
              <>
                <dt>{text.maxWords}</dt>
                <dd>{template.maxWords}</dd>
              </>
            )}
          </dl>
          <div>
            <p className={ui.label}>{text.body}</p>
            <div className={styles.template}>{template.body}</div>
          </div>
          <div>
            <p className={ui.label}>{text.sources}</p>
            {template.sources.length === 0 ? (
              <p className={ui.hint}>{text.noSources}</p>
            ) : (
              <ul className={styles.bullets}>
                {template.sources.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            )}
          </div>
          {template.notes ? (
            <div>
              <p className={ui.label}>{text.notes}</p>
              <p className={styles.template}>{template.notes}</p>
            </div>
          ) : null}
        </>
      ) : (
        <p className={ui.notice}>{text.none}</p>
      )}
      {open ? (
        <form method="post" className={ui.form} onSubmit={submit} noValidate>
          <h4 ref={heading} tabIndex={-1} className={ui.h3}>
            {edit}
          </h4>
          <Field
            id={`${id}-asunto`}
            name="subject"
            label={text.subject}
            defaultValue={template?.subject}
            required
            maxLength={300}
            errorId={error ? `${id}-error` : undefined}
          />
          <Field
            id={`${id}-texto`}
            name="body"
            label={text.body}
            defaultValue={template?.body}
            required
            multiline
            large
            maxLength={40_000}
            invalid={refusal !== undefined && write.refusal === undefined}
            errorId={error ? `${id}-error` : undefined}
          />
          <Field
            id={`${id}-palabras`}
            name="maxWords"
            label={text.maxWords}
            hint={text.maxWordsHint}
            type="number"
            defaultValue={template?.maxWords}
          />
          <Field
            id={`${id}-fuentes`}
            name="sources"
            label={text.sources}
            hint={text.sourcesHint}
            defaultValue={template?.sources.join('\n')}
            multiline
          />
          <Field
            id={`${id}-notas`}
            name="notes"
            label={text.notes}
            defaultValue={template?.notes}
            multiline
            maxLength={4000}
          />
          <FormError id={`${id}-error`} message={error} />
          <div className={ui.rowActions}>
            <button type="submit" className={ui.button} aria-disabled={write.pending}>
              {text.save}
            </button>
            <button type="button" className={ui.textButton} onClick={hide}>
              {text.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button
            ref={opener}
            type="button"
            className={ui.secondaryButton}
            onClick={() => {
              write.clear();
              setRefusal(undefined);
              show();
            }}
          >
            {edit}
          </button>
        </div>
      )}
    </div>
  );
};
