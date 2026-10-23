'use client';

import type { ContactChannel } from '@backoffice/domain/stages';

import { useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
import { MessageOptions } from '@/onboarding/messages/MessageOptions';
import * as onboarding from '@/onboarding/styles';
import { useAnnounce } from '@/ui/announce';
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
  /** The other ways (PLAN R77): the mail app, or the message copied, and the line saying how. */
  email: string;
  copyMessage: string;
  messageCopied: string;
  how: string;
  /** "Por dónde", asked of a copied message, and where it may have gone. */
  where: string;
  channels: readonly { value: ContactChannel; label: string }[];
  /** "Mensaje": the picker of the census link messages, when there are several (Mensajes, PLAN M5). */
  choose: string;
  chooseHint: string;
  /** "Tuyos" and "Del equipo", the picker's groups when it has both (PLAN R71). */
  chooseMine: string;
  chooseTeam: string;
  sent: string;
  sentYes: string;
  sentNo: string;
  sentDone: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * A person's personal link in the Censo queue (census spec): what their last link went through, said in words by the
 * page, and a new one made on request. Its URL is shown only now, to copy or to open WhatsApp with the message ready,
 * written in a census link message from Mensajes (PLAN M5), one's own or the team's (PLAN R71), picked first when
 * there are several; the onboarder sends it from their own number and, back here, says so ("¿Lo has enviado?"), which
 * logs the attempt. Without a phone there is no WhatsApp: the link is copied and sent another way.
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
  /** The census link messages in use, one's own and then the team's, in their order; none for the code's own. */
  messages: readonly { id: string; title: string; mine: boolean }[];
  text: CensusLinkText;
}) => {
  const write = useWrite(text.errors);
  const [message, setMessage] = useState(messages[0]?.id);
  const [created, setCreated] = useState<NewCensusLink>();
  const [unreadable, setUnreadable] = useState(false);
  const announce = useAnnounce();
  // How the message left the page (PLAN R77): asked "¿Lo has enviado?" after it, by its channel.
  const [asking, setAsking] = useState<'whatsapp' | 'email' | 'copy'>();
  const [channel, setChannel] = useState<ContactChannel>('other');
  const [copyFailed, setCopyFailed] = useState(false);
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
      setAsking(undefined);
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
          <p className={ui.hint}>{text.how}</p>
          <div className={ui.rowActions}>
            {created.whatsapp === null ? null : (
              <a
                className={ui.button}
                href={created.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAsking('whatsapp')}
              >
                {text.whatsapp}
              </a>
            )}
            {created.email === null ? null : (
              <a
                className={created.whatsapp === null ? ui.button : ui.secondaryButton}
                href={created.email}
                onClick={() => setAsking('email')}
              >
                {text.email}
              </a>
            )}
            {created.message === null ? null : (
              <button
                type="button"
                className={ui.secondaryButton}
                onClick={() => {
                  setCopyFailed(false);
                  navigator.clipboard.writeText(created.message ?? '').then(
                    () => {
                      announce(text.messageCopied);
                      setAsking('copy');
                    },
                    () => setCopyFailed(true),
                  );
                }}
              >
                {text.copyMessage}
              </button>
            )}
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
              {asking === 'copy' ? (
                <div className={ui.field}>
                  <label className={ui.label} htmlFor={`${base}-por-donde`}>
                    {text.where}
                  </label>
                  <select
                    id={`${base}-por-donde`}
                    className={onboarding.select}
                    value={channel}
                    onChange={(event) =>
                      setChannel(
                        text.channels.find((option) => option.value === event.target.value)
                          ?.value ?? channel,
                      )
                    }
                  >
                    {text.channels.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className={ui.rowActions}>
                <button
                  type="button"
                  className={ui.button}
                  aria-disabled={write.pending}
                  onClick={async () => {
                    const answer = await write.run(
                      () => markCensusLinkSent(created.id, asking === 'copy' ? channel : asking),
                      { done: text.sentDone },
                    );
                    if (answer?.ok) {
                      setAsking(undefined);
                    }
                  }}
                >
                  {text.sentYes}
                </button>
                <button
                  type="button"
                  className={ui.textButton}
                  onClick={() => setAsking(undefined)}
                >
                  {text.sentNo}
                </button>
              </div>
            </div>
          ) : null}
          <FormError message={copyFailed ? text.copyFailed : undefined} />
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
                <MessageOptions
                  options={messages.map(({ id, title, mine }) => ({ value: id, title, mine }))}
                  text={{ mine: text.chooseMine, team: text.chooseTeam }}
                />
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
