'use client';

import { useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
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
  noPhone: string;
  sent: string;
  sentYes: string;
  sentNo: string;
  sentDone: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * A person's personal link in the Censo queue (census spec): what their last link went through, said in words by the
 * page, and a new one made on request. Its URL is shown only now, to copy or to open WhatsApp with the message ready;
 * the onboarder sends it from their own number and, back here, says so ("¿Lo has enviado?"), which logs the attempt.
 * Without a phone there is no WhatsApp: the link is copied and sent another way.
 */
export const CensusLinkPanel = ({
  personId,
  name,
  link,
  text,
}: {
  personId: string;
  name: string;
  /** The last link, as the page words it (format.ts linkText), and whether it still serves. */
  link: { line: string; serves: boolean } | null;
  text: CensusLinkText;
}) => {
  const write = useWrite(text.errors);
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
    const answer = await write.run(() => createCensusLink(personId));
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
      )}
      <FormError message={unreadable ? text.errors.unexpected : write.error} />
    </div>
  );
};
