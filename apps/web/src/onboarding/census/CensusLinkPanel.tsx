'use client';

import { useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
import * as onboarding from '@/onboarding/styles';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { createCensusLink, markCensusLinkSent } from './actions';
import { CopyLink } from './CopyLink';
import { type NewCensusLink, parseNewLink } from './types';

export interface CensusLinkText {
  linkNone: string;
  /** "Crear enlace para {name}", the button's name for screen readers. */
  createFor: string;
  create: string;
  /** "Crear un enlace nuevo para {name}" */
  createAgainFor: string;
  createAgain: string;
  createAgainHint: string;
  created: string;
  url: string;
  urlHint: string;
  copy: string;
  copied: string;
  copyFailed: string;
  whatsapp: string;
  whatsappIntro: string;
  /** "Mensaje": the picker of the team's census link messages, when there are several (Mensajes, PLAN M5). */
  choose: string;
  chooseHint: string;
  noPhone: string;
  sent: string;
  sentYes: string;
  sentNo: string;
  sentDone: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * A person's personal link in the Censo queue (census spec): what their last link went through, said in words by the
 * page, and a new one made on request. Its URL is shown only now, to copy or to open WhatsApp with the message ready,
 * written in the team's census link message (Mensajes, PLAN M5), picked first when there are several; the onboarder
 * sends it from their own number and, back here, says so ("¿Lo has enviado?"), which logs the attempt. Without a phone
 * there is no WhatsApp: the link is copied and sent another way.
 */
export const CensusLinkPanel = ({
  personId,
  name,
  link,
  messages,
  text,
}: {
  personId: string;
  name: string;
  /** The last link, as the page words it (format.ts linkText), and whether it still serves. */
  link: { line: string; serves: boolean } | null;
  /** The team's census link messages in use, in their order; none for the code's own. */
  messages: readonly { id: string; title: string }[];
  text: CensusLinkText;
}) => {
  const write = useWrite(text.errors);
  const [message, setMessage] = useState(messages[0]?.id);
  const [created, setCreated] = useState<NewCensusLink>();
  const [unreadable, setUnreadable] = useState(false);
  const [asking, setAsking] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const question = useRef<HTMLDivElement>(null);
  const base = `censo-${personId}`;

  useEffect(() => {
    if (created) {
      panel.current?.focus();
    }
  }, [created]);

  useEffect(() => {
    if (asking) {
      question.current?.focus();
    }
  }, [asking]);

  const create = async () => {
    setUnreadable(false);
    const answer = await write.run(() => createCensusLink(personId, message));
    if (answer?.ok) {
      const parsed = parseNewLink(answer.body);
      setCreated(parsed);
      setUnreadable(parsed === undefined);
      setAsking(false);
    }
  };

  return (
    <div className={ui.form}>
      <p className={ui.hint}>{link?.line ?? text.linkNone}</p>
      {created ? (
        <div
          ref={panel}
          tabIndex={-1}
          role="group"
          aria-label={text.url}
          aria-describedby={`${base}-creado`}
          className={ui.form}
        >
          <p id={`${base}-creado`} className={ui.done}>
            {text.created}
          </p>
          <CopyLink
            id={`${base}-enlace`}
            url={created.url}
            text={{
              label: text.url,
              hint: text.urlHint,
              copy: text.copy,
              copied: text.copied,
              copyFailed: text.copyFailed,
            }}
          />
          {created.whatsapp === null ? (
            <p className={ui.hint}>{text.noPhone}</p>
          ) : (
            <>
              <p className={ui.hint}>{text.whatsappIntro}</p>
              <div>
                <a
                  className={ui.button}
                  href={created.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setAsking(true)}
                >
                  {text.whatsapp}
                </a>
              </div>
              {asking ? (
                <div
                  ref={question}
                  tabIndex={-1}
                  role="group"
                  aria-label={text.sent}
                  className={ui.confirm}
                >
                  <p>{text.sent}</p>
                  <div className={ui.rowActions}>
                    <button
                      type="button"
                      className={ui.button}
                      aria-disabled={write.pending}
                      onClick={async () => {
                        const answer = await write.run(() => markCensusLinkSent(created.id), {
                          done: text.sentDone,
                        });
                        if (answer?.ok) {
                          setAsking(false);
                        }
                      }}
                    >
                      {text.sentYes}
                    </button>
                    <button
                      type="button"
                      className={ui.textButton}
                      onClick={() => setAsking(false)}
                    >
                      {text.sentNo}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className={ui.form}>
          {messages.length > 1 ? (
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${base}-mensaje`}>
                {text.choose}
              </label>
              <select
                id={`${base}-mensaje`}
                className={onboarding.select}
                value={message}
                aria-describedby={`${base}-mensaje-pista`}
                onChange={(event) => setMessage(event.target.value)}
              >
                {messages.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
              <span id={`${base}-mensaje-pista`} className={ui.hint}>
                {text.chooseHint}
              </span>
            </div>
          ) : null}
          <div className={ui.rowActions}>
            <button
              type="button"
              className={link === null ? ui.button : ui.secondaryButton}
              aria-disabled={write.pending}
              aria-label={fill(link === null ? text.createFor : text.createAgainFor, { name })}
              aria-describedby={link?.serves ? `${base}-sirve` : undefined}
              onClick={() => void create()}
            >
              {link === null ? text.create : text.createAgain}
            </button>
            {link?.serves ? (
              <p id={`${base}-sirve`} className={ui.hint}>
                {text.createAgainHint}
              </p>
            ) : null}
          </div>
        </div>
      )}
      <FormError message={unreadable ? text.errors.unexpected : write.error} />
    </div>
  );
};
