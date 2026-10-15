'use client';

import type { Messages } from '@backoffice/i18n/catalog';

import Link from 'next/link';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
import * as styles from '@/ui/styles';

import {
  AVAILABILITY,
  buildAnswer,
  type CensusOption,
  FIELD_OF,
  type FormInfo,
  normalisedHint,
  outcomeOf,
  parseFormInfo,
  type Problem,
} from './answer';
import { tokenFromHash } from './token';

/** The census's words, from the server: the client ships no message formatter (fill() does the placeholders). */
export type CensusText = Omit<Messages['census'], 'privacy'>;

export interface CensusFormProps {
  /** The personal link's page (`/c`), whose token is in the address's fragment. */
  personal: boolean;
  text: CensusText;
  availability: Messages['availability'];
  /** Where the privacy notice is: the association's, or this app's draft. */
  privacyUrl: string;
}

type Done = 'created' | 'updated' | 'review';
type SendError = 'invalid' | 'limit' | 'failed' | 'tooFast';

type View =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'invalidLink'; afterSubmit: boolean }
  | { kind: 'form'; info: FormInfo; startedAt: number }
  | { kind: 'done'; outcome: Done };

const PROBLEMS: ReadonlySet<string> = new Set<Problem>([
  'name',
  'contact',
  'email',
  'phone',
  'consentPrivacy',
  'ageOk',
]);

/** The optional text fields, which the API may still refuse (too long): their problem is shown under them. */
const TEXT_FIELDS: ReadonlySet<string> = new Set([
  'preferredName',
  'pronouns',
  'province',
  'town',
  'languages',
  'skillsOther',
  'interestsOther',
  'howHeard',
]);

const idOf = (field: string) => `census-${field}`;

const describedBy = (...ids: (string | false | undefined)[]): string | undefined =>
  ids.filter(Boolean).join(' ') || undefined;

/** A POST to this app's own routes; status 0 when the network failed. */
const post = async (path: '/formulario' | '/enviar', body: object) => {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return {
      status: response.status,
      body: (await response.json().catch(() => undefined)) as unknown,
    };
  } catch {
    return { status: 0, body: undefined };
  }
};

/** Puts the focus on a field of the form by its name: the first of its checkboxes, for a group. */
const focusField = (form: HTMLFormElement, name: string) => {
  const element = form.elements.namedItem(name);
  const target = element instanceof RadioNodeList ? element[0] : element;
  if (target instanceof HTMLElement) {
    target.focus();
  }
};

/**
 * The census (onboarding spec §7.2): loads the form's lists through this app's server, then sends the answer the same
 * way. On a personal link the token is read from the address's fragment and taken out of the address bar at once, so
 * it is not left in the history or in a screenshot; it then travels only in the requests' bodies. Problems are shown
 * under their fields, in words, and focus goes to the first; the result is shown in place and takes focus.
 */
export const CensusForm = ({ personal, text, availability, privacyUrl }: CensusFormProps) => {
  const [token] = useState(() => (personal ? tokenFromHash(window.location.hash) : undefined));
  const [view, setView] = useState<View>(
    personal && !token ? { kind: 'invalidLink', afterSubmit: false } : { kind: 'loading' },
  );
  const [problems, setProblems] = useState<Problem[]>([]);
  const [apiField, setApiField] = useState<string>();
  const [sendError, setSendError] = useState<SendError>();
  const [pending, setPending] = useState(false);
  const [hints, setHints] = useState<{ email?: string; phone?: string }>({});
  const result = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);

  useEffect(() => {
    if (window.location.hash !== '') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (personal && !token) {
      return undefined;
    }
    let live = true;
    void post('/formulario', token ? { token } : {}).then(({ status, body }) => {
      if (!live) {
        return;
      }
      const info = status === 200 ? parseFormInfo(body, 'v1') : undefined;
      if (!info) {
        setView({ kind: 'unavailable' });
      } else if (info.link === 'invalid') {
        setView({ kind: 'invalidLink', afterSubmit: false });
      } else {
        setView({ kind: 'form', info, startedAt: Date.now() });
      }
    });
    return () => {
      live = false;
    };
  }, [personal, token]);

  // Where the page lands after sending: the thanks, or the reason the link no longer works.
  useEffect(() => {
    if (view.kind === 'done' || (view.kind === 'invalidLink' && view.afterSubmit)) {
      result.current?.focus();
    }
  }, [view]);

  if (view.kind === 'loading') {
    return (
      <p className={styles.text} role="status">
        {text.loading}
      </p>
    );
  }
  if (view.kind === 'unavailable') {
    return (
      <div className={styles.alert} role="alert">
        <p>
          <span aria-hidden="true">⚠ </span>
          {text.unavailable}
        </p>
      </div>
    );
  }
  if (view.kind === 'invalidLink') {
    return (
      <div>
        <h2 className={styles.h2} ref={result} tabIndex={-1}>
          {text.invalidLinkTitle}
        </h2>
        <p className={styles.text}>{text.invalidLink}</p>
        <Link className={styles.link} href="/">
          {text.toGeneric}
        </Link>
      </div>
    );
  }
  if (view.kind === 'done') {
    return (
      <p className={styles.done} ref={result} tabIndex={-1}>
        <span aria-hidden="true">✓ </span>
        {text.outcomes[view.outcome]}
      </p>
    );
  }

  const { info, startedAt } = view;
  const skills = info.options.filter((option) => option.kind === 'skill');
  const interests = info.options.filter((option) => option.kind === 'interest');
  const problemOf = (field: string): string | undefined => {
    const problem = problems.find((one) => FIELD_OF[one] === field);
    if (problem) {
      return text.problems[problem];
    }
    return apiField === field ? text.errors.invalidField : undefined;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const { answer, problems: found } = buildAnswer(data, info.options);
    setProblems(found);
    setApiField(undefined);
    setSendError(undefined);
    const [first] = found;
    if (first) {
      focusField(form, FIELD_OF[first]);
      return;
    }
    setPending(true);
    const website = data.get('website');
    const sent = await post('/enviar', {
      ...(token ? { token } : {}),
      startedAt,
      website: typeof website === 'string' ? website : '',
      answer,
    });
    setPending(false);
    const outcome =
      sent.status === 0 ? ({ kind: 'failed' } as const) : outcomeOf(sent.status, sent.body);
    if (outcome.kind === 'done') {
      setView({ kind: 'done', outcome: outcome.outcome });
    } else if (outcome.kind === 'invalidLink') {
      setView({ kind: 'invalidLink', afterSubmit: true });
    } else if (outcome.kind === 'limit' || outcome.kind === 'failed') {
      setSendError(outcome.kind);
    } else if (outcome.field === 'startedAt') {
      setSendError('tooFast');
    } else if (outcome.field && PROBLEMS.has(outcome.field)) {
      setProblems([outcome.field as Problem]);
      focusField(form, FIELD_OF[outcome.field as Problem]);
    } else if (outcome.field && TEXT_FIELDS.has(outcome.field)) {
      setApiField(outcome.field);
      focusField(form, outcome.field);
    } else {
      setSendError('invalid');
    }
  };

  const showHint = (kind: 'email' | 'phone', value: string) => {
    const normalised = normalisedHint(kind, value);
    setHints((current) => ({
      ...current,
      [kind]: normalised ? fill(text.willBe, { value: normalised }) : undefined,
    }));
  };

  const textField = (
    field: string,
    label: string,
    {
      hint,
      required = false,
      type = 'text',
      autoComplete = 'off',
      inputMode,
      live,
      onBlur,
      multiline = false,
    }: {
      hint?: string;
      required?: boolean;
      type?: 'text' | 'email' | 'tel';
      autoComplete?: string;
      inputMode?: 'text' | 'email' | 'tel';
      /** Said politely as it changes: how an email or phone will be stored. */
      live?: string;
      onBlur?: (value: string) => void;
      multiline?: boolean;
    } = {},
  ): ReactNode => {
    const id = idOf(field);
    const problem = problemOf(field);
    const shared = {
      id,
      name: field,
      required,
      autoComplete,
      'aria-invalid': problem ? true : undefined,
      'aria-describedby': describedBy(
        hint && `${id}-hint`,
        live !== undefined && `${id}-live`,
        problem && `${id}-error`,
      ),
    } as const;
    return (
      <div className={styles.field}>
        <label className={styles.label} htmlFor={id}>
          {label}
          {required ? <span className={styles.hint}> {text.required}</span> : null}
        </label>
        {hint ? (
          <p className={styles.hint} id={`${id}-hint`}>
            {hint}
          </p>
        ) : null}
        {multiline ? (
          <textarea className={styles.textarea} {...shared} />
        ) : (
          <input
            className={styles.input}
            type={type}
            inputMode={inputMode}
            onBlur={onBlur ? (event) => onBlur(event.currentTarget.value) : undefined}
            {...shared}
          />
        )}
        {live === undefined ? null : (
          <p className={styles.hint} id={`${id}-live`} aria-live="polite">
            {live}
          </p>
        )}
        {problem ? (
          <p className={styles.fieldError} id={`${id}-error`}>
            {problem}
          </p>
        ) : null}
      </div>
    );
  };

  const checkbox = (field: string, label: ReactNode, hint?: ReactNode): ReactNode => {
    const id = idOf(field);
    const problem = problemOf(field);
    return (
      <div className={styles.choice}>
        <input
          id={id}
          name={field}
          type="checkbox"
          aria-invalid={problem ? true : undefined}
          aria-describedby={describedBy(
            hint !== undefined && `${id}-hint`,
            problem && `${id}-error`,
          )}
        />
        <label htmlFor={id}>
          <span>{label}</span>
        </label>
        {hint === undefined ? null : (
          <div className={`${styles.choiceNote} ${styles.hint}`} id={`${id}-hint`}>
            {hint}
          </div>
        )}
        {problem ? (
          <p className={`${styles.choiceNote} ${styles.fieldError}`} id={`${id}-error`}>
            {problem}
          </p>
        ) : null}
      </div>
    );
  };

  const optionGroup = (legend: string, options: CensusOption[]): ReactNode => (
    <fieldset className={styles.fieldset}>
      <legend>{legend}</legend>
      {options.length === 0 ? <p className={styles.hint}>{text.noOptions}</p> : null}
      {options.map((option) => (
        <div className={styles.choice} key={option.id}>
          <input id={idOf(option.id)} name="options" type="checkbox" value={option.id} />
          <label htmlFor={idOf(option.id)}>{option.label}</label>
        </div>
      ))}
    </fieldset>
  );

  return (
    <>
      {personal ? (
        <p className={styles.text}>
          {info.greeting
            ? fill(text.personalIntro, { name: info.greeting })
            : text.personalIntroNoName}
        </p>
      ) : null}
      <form className={styles.form} noValidate onSubmit={submit}>
        <fieldset className={styles.section}>
          <legend>{text.about}</legend>
          {textField('name', text.name, { required: true, autoComplete: 'name' })}
          {textField('preferredName', text.preferredName, {
            hint: text.preferredNameHint,
            autoComplete: 'nickname',
          })}
          {textField('pronouns', text.pronouns, { hint: text.pronounsHint })}
          {textField('province', text.province, { autoComplete: 'address-level1' })}
          {textField('town', text.town, { autoComplete: 'address-level2' })}
          {textField('languages', text.languages, { hint: text.languagesHint })}
        </fieldset>

        <fieldset className={styles.section} aria-describedby="census-contact-hint">
          <legend>{text.contact}</legend>
          <p className={styles.hint} id="census-contact-hint">
            {text.contactHint}
          </p>
          {textField('email', text.email, {
            type: 'email',
            autoComplete: 'email',
            inputMode: 'email',
            live: hints.email ?? '',
            onBlur: (value) => showHint('email', value),
          })}
          {textField('phone', text.phone, {
            type: 'tel',
            autoComplete: 'tel',
            inputMode: 'tel',
            hint: text.phoneHint,
            live: hints.phone ?? '',
            onBlur: (value) => showHint('phone', value),
          })}
        </fieldset>

        <fieldset className={styles.section}>
          <legend>{text.help}</legend>
          {optionGroup(text.skills, skills)}
          {textField('skillsOther', text.skillsOther)}
          {optionGroup(text.interests, interests)}
          {textField('interestsOther', text.interestsOther)}
          <div className={styles.field}>
            <label className={styles.label} htmlFor={idOf('availability')}>
              {text.availability}
            </label>
            <select
              className={styles.input}
              id={idOf('availability')}
              name="availability"
              defaultValue=""
            >
              <option value="">{text.availabilityNone}</option>
              {AVAILABILITY.map((value) => (
                <option key={value} value={value}>
                  {availability[value]}
                </option>
              ))}
            </select>
          </div>
          {textField('howHeard', text.howHeard, { multiline: true })}
        </fieldset>

        <fieldset className={styles.section}>
          <legend>{text.consent}</legend>
          {checkbox('consentEmail', text.consentEmail)}
          {checkbox('consentWhatsapp', text.consentWhatsapp)}
          {checkbox(
            'consentPrivacy',
            <>
              {text.consentPrivacy}
              <span className={styles.hint}>&nbsp;{text.required}</span>
            </>,
            <a className={styles.link} href={privacyUrl} target="_blank" rel="noopener noreferrer">
              {text.privacyLink}
            </a>,
          )}
          {checkbox(
            'ageOk',
            <>
              {text.ageOk}
              <span className={styles.hint}>&nbsp;{text.required}</span>
            </>,
            text.ageHint,
          )}
          <p className={styles.hint}>{fill(text.wording, { version: info.wordingVersion })}</p>
        </fieldset>

        {/* The honeypot: people never see it; whatever fills it in is answered as if it worked, and dropped. */}
        <div className={styles.trap} aria-hidden="true">
          <label htmlFor={idOf('website')}>{text.honeypot}</label>
          <input id={idOf('website')} name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {problems.length > 1 ? (
          <div className={styles.alert}>
            <p>
              <span aria-hidden="true">⚠ </span>
              {text.problemsTitle}
            </p>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>
                  <a className={styles.link} href={`#${idOf(FIELD_OF[problem])}`}>
                    {text.problems[problem]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div role="alert">
          {sendError ? (
            <div className={styles.alert}>
              <p>
                <span aria-hidden="true">⚠ </span>
                {text.errors[sendError]}
              </p>
            </div>
          ) : null}
        </div>
        <button className={styles.button} type="submit" aria-disabled={pending}>
          {pending ? text.sending : text.submit}
        </button>
      </form>
    </>
  );
};
