'use client';

import {
  fillMessage,
  type MessagePurpose,
  namelessDraft,
  templateProblems,
} from '@backoffice/domain/message-templates';
import { type FormEvent, type Ref, useState } from 'react';

import { describedBy, formText } from '@/auth/client';
import { fill } from '@/fill';
import * as onboarding from '@/onboarding/styles';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { MessageTemplate } from '../types';
import type { MessagesPageText } from './text';

import { addMessageTemplate, changeMessageTemplate } from './actions';
import { problemText } from './problems';
import * as styles from './styles';

/** The database's refusal by its rule's name, in the words of the problem it found. */
const REFUSED: Readonly<Record<string, keyof MessagesPageText['problem']>> = {
  message_templates_placeholders_check: 'brace',
  message_templates_link_check: 'needsLink',
  message_templates_nameless_check: 'needsNameless',
};

/**
 * A message written or rewritten in place (Mensajes, PLAN M5): its title, what it says with its placeholders, and,
 * when it uses {nombre}, how it reads for someone without a name, drafted from the message until it's touched. What
 * the database would refuse is listed as it's typed and said on saving; below, the message as it goes out, to an
 * example person and to someone without a name.
 */
export const MessageEditor = ({
  purpose,
  template,
  me,
  heading,
  title,
  text,
  onDone,
}: {
  purpose: MessagePurpose;
  /** The message rewritten; none for a new one. */
  template: MessageTemplate | null;
  /** Who writes, for {yo} in the preview: the staff member's display name. */
  me: string;
  heading: Ref<HTMLHeadingElement>;
  title: string;
  text: MessagesPageText;
  onDone: () => void;
}) => {
  const write = useWrite(text.errors);
  const [body, setBody] = useState(template?.body ?? '');
  const [nameless, setNameless] = useState(template?.bodyNameless ?? '');
  const [namelessTouched, setNamelessTouched] = useState(
    template !== null && template.bodyNameless !== null,
  );
  const [tried, setTried] = useState(false);
  // What stopped the last save, as it was then: the alert isn't rewritten (and re-announced) at every keystroke.
  const [stopped, setStopped] = useState<string>();
  const base = template ? `mensaje-${template.id}` : `mensaje-nuevo-${purpose}`;

  const usesName = body.includes('{nombre}');
  const namelessText = usesName ? (namelessTouched ? nameless : namelessDraft(body)) : null;
  const problems = body.trim() === '' ? [] : templateProblems(purpose, body, namelessText);
  const problemsId = `${base}-problemas`;
  const errorId = `${base}-error`;
  const refused = write.refusal?.body.constraint;
  const refusedWords =
    typeof refused === 'string' && REFUSED[refused] !== undefined
      ? text.problem[REFUSED[refused]]
      : undefined;
  const error = stopped ?? refusedWords ?? write.error;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTried(true);
    const titleValue = formText(event.currentTarget, 'title').trim();
    const why =
      titleValue === ''
        ? text.titleMissing
        : body.trim() === ''
          ? text.bodyMissing
          : problems.length > 0
            ? `${text.problems} ${problems.map((problem) => problemText(problem, purpose, text.problem)).join(' ')}`
            : undefined;
    setStopped(why);
    if (why !== undefined) {
      write.clear();
      return;
    }
    const message = { title: titleValue, body, bodyNameless: namelessText };
    const answer = await write.run(
      () =>
        template
          ? changeMessageTemplate(template.id, message)
          : addMessageTemplate({ purpose, ...message }),
      { done: template ? text.saved : text.added },
    );
    if (answer?.ok) {
      onDone();
    }
  };

  const example = { yo: me, enlace: text.exampleLink };
  const previews = usesName
    ? [
        {
          label: fill(text.previewNamed, { name: text.exampleName }),
          message: fillMessage(
            { body, bodyNameless: namelessText },
            { ...example, nombre: text.exampleName },
          ),
        },
        {
          label: text.previewNameless,
          message: fillMessage({ body, bodyNameless: namelessText }, example),
        },
      ]
    : [{ label: text.preview, message: fillMessage({ body, bodyNameless: null }, example) }];

  return (
    <form className={ui.form} onSubmit={submit} noValidate>
      <h3 ref={heading} tabIndex={-1} className={ui.h3}>
        {title}
      </h3>
      <div className={ui.field}>
        <label className={ui.label} htmlFor={`${base}-titulo`}>
          {text.titleLabel}
        </label>
        <input
          id={`${base}-titulo`}
          name="title"
          className={ui.input}
          defaultValue={template?.title ?? ''}
          required
          maxLength={80}
          aria-describedby={describedBy(`${base}-titulo-pista`, error ? errorId : undefined)}
        />
        <span id={`${base}-titulo-pista`} className={ui.hint}>
          {text.titleHint}
        </span>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor={`${base}-texto`}>
          {text.body}
        </label>
        <textarea
          id={`${base}-texto`}
          className={onboarding.textarea}
          value={body}
          onChange={(event) => {
            setStopped(undefined);
            setBody(event.target.value);
          }}
          required
          maxLength={2000}
          aria-invalid={tried && problems.length > 0}
          aria-describedby={describedBy(
            problems.length > 0 && problemsId,
            error ? errorId : undefined,
          )}
        />
      </div>
      {usesName ? (
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${base}-sin-nombre`}>
            {text.bodyNameless}
          </label>
          <textarea
            id={`${base}-sin-nombre`}
            className={onboarding.textarea}
            value={namelessText ?? ''}
            onChange={(event) => {
              setStopped(undefined);
              setNamelessTouched(true);
              setNameless(event.target.value);
            }}
            maxLength={2000}
            aria-describedby={describedBy(
              `${base}-sin-nombre-pista`,
              problems.length > 0 && problemsId,
            )}
          />
          <span id={`${base}-sin-nombre-pista`} className={ui.hint}>
            {text.bodyNamelessHint}
          </span>
        </div>
      ) : null}
      {problems.length > 0 ? (
        <div id={problemsId}>
          <p className={ui.label}>{text.problems}</p>
          <ul className={styles.problems}>
            {problems.map((problem) => (
              <li key={problem.kind === 'unknown' ? problem.placeholder : problem.kind}>
                {problemText(problem, purpose, text.problem)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {body.trim() === ''
        ? null
        : previews.map((preview) => (
            <div key={preview.label}>
              <p className={ui.label}>{preview.label}</p>
              <div className={styles.message}>{preview.message}</div>
            </div>
          ))}
      <FormError id={errorId} message={error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.save}
        </button>
        <button type="button" className={ui.textButton} onClick={onDone}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
};
