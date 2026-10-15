'use client';

import { useEffect, useRef, useState } from 'react';

import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { PersonPageText } from './text';

import { addAttempt } from '../actions';

/**
 * The WhatsApp handover (onboarding spec, WhatsApp handover links): a link that opens WhatsApp with the message ready,
 * which the onboarder sends from their own number; back here, "¿Lo has enviado?" logs it as a contact attempt (a
 * message left). Nothing is ever sent by the backoffice.
 */
export const WhatsAppHandover = ({
  personId,
  link,
  text,
}: {
  personId: string;
  /** The handover link (whatsapp-message.ts), or undefined without a phone. */
  link: string | undefined;
  text: PersonPageText;
}) => {
  const t = text.whatsapp;
  const write = useWrite(text.errors);
  const [asking, setAsking] = useState(false);
  const question = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (asking) {
      question.current?.focus();
    }
  }, [asking]);

  if (link === undefined) {
    return <p className={ui.hint}>{t.noPhone}</p>;
  }
  return (
    <div className={ui.form}>
      <p className={ui.hint}>{t.intro}</p>
      <div>
        <a
          className={ui.button}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setAsking(true)}
        >
          {t.open}
        </a>
      </div>
      {asking ? (
        <div ref={question} tabIndex={-1} role="group" aria-label={t.sent} className={ui.confirm}>
          <p>{t.sent}</p>
          <div className={ui.rowActions}>
            <button
              type="button"
              className={ui.button}
              aria-disabled={write.pending}
              onClick={async () => {
                const answer = await write.run(
                  () => addAttempt(personId, { channel: 'whatsapp', outcome: 'left_message' }),
                  { done: t.logged },
                );
                if (answer?.ok) {
                  setAsking(false);
                }
              }}
            >
              {t.yes}
            </button>
            <button type="button" className={ui.textButton} onClick={() => setAsking(false)}>
              {t.no}
            </button>
          </div>
        </div>
      ) : null}
      <FormError message={write.error} />
    </div>
  );
};
