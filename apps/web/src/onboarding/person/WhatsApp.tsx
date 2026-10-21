'use client';

import { useEffect, useRef, useState } from 'react';

import { MessageOptions } from '@/onboarding/messages/MessageOptions';
import * as onboarding from '@/onboarding/styles';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { PersonPageText } from './text';

import { addAttempt } from '../actions';

/** A message to open WhatsApp with: one written in Mensajes (its id and version), or the code's own. */
export interface WhatsAppChoice {
  template: { id: string; version: number } | null;
  /** Its title in Mensajes; none for the code's own. */
  title: string | null;
  /** One's own (PLAN R71), rather than the team's or the code's. */
  mine: boolean;
  /** The handover link with this message (whatsapp-message.ts), or undefined without a phone. */
  link: string | undefined;
}

/**
 * The WhatsApp handover (onboarding spec, WhatsApp handover links): a link that opens WhatsApp with the message ready,
 * which the onboarder sends from their own number; back here, "¿Lo has enviado?" logs it as a contact attempt (a
 * message left), naming the message when it was written in Mensajes (PLAN M5). With several in use, one's own first and
 * then the team's (PLAN R71), the one to open is picked first, the first already picked. Nothing is ever sent by the
 * backoffice.
 */
export const WhatsAppHandover = ({
  personId,
  choices,
  text,
}: {
  personId: string;
  /** At least one: those in use, one's own and then the team's, in their order; or the code's own. */
  choices: readonly WhatsAppChoice[];
  text: PersonPageText;
}) => {
  const t = text.whatsapp;
  const write = useWrite(text.errors);
  const [asking, setAsking] = useState(false);
  const [picked, setPicked] = useState(0);
  const question = useRef<HTMLDivElement>(null);
  const choice = choices[picked] ?? choices[0];

  useEffect(() => {
    if (asking) {
      question.current?.focus();
    }
  }, [asking]);

  if (choice?.link === undefined) {
    return <p className={ui.hint}>{t.noPhone}</p>;
  }
  const { template } = choice;
  return (
    <div className={ui.form}>
      {choices.length > 1 ? (
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`whatsapp-${personId}`}>
            {t.choose}
          </label>
          <select
            id={`whatsapp-${personId}`}
            className={onboarding.select}
            value={picked}
            aria-describedby={`whatsapp-${personId}-pista`}
            onChange={(event) => {
              setPicked(Number(event.target.value));
              setAsking(false);
            }}
          >
            <MessageOptions
              options={choices.map((option, index) => ({
                value: String(index),
                title: option.title ?? '',
                mine: option.mine,
              }))}
              text={{ mine: t.chooseMine, team: t.chooseTeam }}
            />
          </select>
          <span id={`whatsapp-${personId}-pista`} className={ui.hint}>
            {t.chooseHint}
          </span>
        </div>
      ) : null}
      <div>
        <a
          className={ui.button}
          href={choice.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-describedby={`whatsapp-${personId}-intro`}
          onClick={() => setAsking(true)}
        >
          {t.open}
        </a>
        <p id={`whatsapp-${personId}-intro`} className={ui.hint}>
          {t.intro}
        </p>
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
                  () =>
                    addAttempt(personId, {
                      channel: 'whatsapp',
                      outcome: 'left_message',
                      ...(template === null
                        ? {}
                        : { templateId: template.id, templateVersion: template.version }),
                    }),
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
