'use client';

import type { ContactChannel } from '@backoffice/domain/stages';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { fill } from '@/fill';
import { MessageOptions } from '@/onboarding/messages/MessageOptions';
import * as messageStyles from '@/onboarding/messages/styles';
import * as onboarding from '@/onboarding/styles';
import { useAnnounce } from '@/ui/announce';
import { Disclosure } from '@/ui/Disclosure';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { PersonPageText } from './text';

import { addAttempt } from '../actions';

/** A message to write to someone with: one from Mensajes (its id and version), or the code's own, filled for them. */
export interface MessageChoice {
  template: { id: string; version: number } | null;
  /** Its title in Mensajes; none for the code's own. */
  title: string | null;
  /** One's own (PLAN R71), rather than the team's or the code's. */
  mine: boolean;
  /** The message as it goes out to this person. */
  message: string;
  /** Opens WhatsApp with it, when there's a number to write to (whatsapp-message.ts). */
  whatsapp: string | undefined;
  /** Opens the mail app with it, when they have an email (PLAN R77). */
  email: string | undefined;
}

/** How the message left the page: in WhatsApp, in the mail app, or copied to go anywhere else. */
type Way = 'whatsapp' | 'email' | 'copy';

/**
 * "Escribirle" (PLAN R77): the message to write to someone with, picked among one's own and the team's (Mensajes, PLAN
 * M5, R71), sent by the onboarder however they reach them: WhatsApp or their mail app opened with it written, or
 * copied for Discord, Telegram or anything else. Back here, "¿Lo has enviado?" logs a contact attempt on that channel
 * (asked, for a copied one), naming the message. Its text is a fold away. Nothing is ever sent by the backoffice.
 */
export const MessageHandover = ({
  personId,
  choices,
  copyChannels,
  copyChannel: initialChannel,
  text,
}: {
  personId: string;
  /** At least one: those in use, one's own and then the team's, in their order; or the code's own. */
  choices: readonly MessageChoice[];
  /** Where a copied message may have gone, by the history's channel, and the one to offer first. */
  copyChannels: readonly { value: ContactChannel; label: string }[];
  copyChannel: ContactChannel;
  text: PersonPageText;
}) => {
  const t = text.handover;
  const write = useWrite(text.errors);
  const announce = useAnnounce();
  const [picked, setPicked] = useState(0);
  const [used, setUsed] = useState<Way>();
  const [copyChannel, setCopyChannel] = useState(initialChannel);
  const [copyFailed, setCopyFailed] = useState(false);
  const question = useRef<HTMLDivElement>(null);
  const choice = choices[picked] ?? choices[0];
  const base = `escribir-${personId}`;

  useEffect(() => {
    if (used) {
      question.current?.focus();
    }
  }, [used]);

  if (choice === undefined) {
    return null;
  }
  const { template } = choice;
  const channel = used === 'whatsapp' ? 'whatsapp' : used === 'email' ? 'email' : copyChannel;

  const copy = () => {
    setCopyFailed(false);
    navigator.clipboard.writeText(choice.message).then(
      () => {
        announce(t.copied);
        setUsed('copy');
      },
      () => setCopyFailed(true),
    );
  };

  const log = async () => {
    const answer = await write.run(
      () =>
        addAttempt(personId, {
          channel,
          outcome: 'left_message',
          ...(template === null
            ? {}
            : { templateId: template.id, templateVersion: template.version }),
        }),
      { done: t.logged },
    );
    if (answer?.ok) {
      setUsed(undefined);
    }
  };

  return (
    <section className={onboarding.handover} aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`} className={ui.h3}>
        {t.title}
      </h2>
      {choices.length > 1 ? (
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${base}-mensaje`}>
            {t.choose}
          </label>
          <select
            id={`${base}-mensaje`}
            className={onboarding.select}
            value={picked}
            onChange={(event) => {
              setPicked(Number(event.target.value));
              setUsed(undefined);
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
        </div>
      ) : (
        <p>{choice.title === null ? t.fallback : fill(t.only, { title: choice.title })}</p>
      )}
      <div className={ui.rowActions}>
        {choice.whatsapp === undefined ? null : (
          <a
            className={ui.button}
            href={choice.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setUsed('whatsapp')}
          >
            {t.whatsapp}
          </a>
        )}
        {choice.email === undefined ? null : (
          <a
            className={choice.whatsapp === undefined ? ui.button : ui.secondaryButton}
            href={choice.email}
            onClick={() => setUsed('email')}
          >
            {t.email}
          </a>
        )}
        <button
          type="button"
          className={
            choice.whatsapp === undefined && choice.email === undefined
              ? ui.button
              : ui.secondaryButton
          }
          onClick={copy}
        >
          {t.copy}
        </button>
      </div>
      <p id={`${base}-como`} className={ui.hint}>
        {t.how}
      </p>
      <Disclosure id={`${base}-texto`} label={t.show}>
        <div className={messageStyles.message}>{choice.message}</div>
        <p className={ui.hint}>
          {t.yours}{' '}
          <Link className={ui.link} href="/mensajes">
            {t.mensajes}
          </Link>
        </p>
      </Disclosure>
      {used ? (
        <div ref={question} tabIndex={-1} role="group" aria-label={t.sent} className={ui.confirm}>
          <p>{t.sent}</p>
          {used === 'copy' ? (
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${base}-por-donde`}>
                {t.where}
              </label>
              <select
                id={`${base}-por-donde`}
                className={onboarding.select}
                value={copyChannel}
                onChange={(event) =>
                  setCopyChannel(
                    copyChannels.find((option) => option.value === event.target.value)?.value ??
                      copyChannel,
                  )
                }
              >
                {copyChannels.map((option) => (
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
              onClick={() => void log()}
            >
              {t.yes}
            </button>
            <button type="button" className={ui.textButton} onClick={() => setUsed(undefined)}>
              {t.no}
            </button>
          </div>
        </div>
      ) : null}
      <FormError message={copyFailed ? t.copyFailed : write.error} />
    </section>
  );
};
