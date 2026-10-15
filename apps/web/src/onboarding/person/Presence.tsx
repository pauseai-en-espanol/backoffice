'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

import { formText } from '@/auth/client';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { PersonPageText } from './text';

import { markJoined, markLeft } from '../actions';

/**
 * Recording that someone left or came (back) to the community (onboarding spec, concepts: community presence): one
 * button, which opens a short form with the date (today if left empty) and, for a join, the chat. Leaving is a
 * signal, not a deletion.
 */
export const PresenceActions = ({
  personId,
  inCommunity,
  chats,
  text,
}: {
  personId: string;
  inCommunity: boolean;
  chats: readonly string[];
  text: PersonPageText;
}) => {
  const t = text.presence;
  const write = useWrite(text.errors);
  const [open, setOpen] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const leaving = inCommunity;

  useEffect(() => {
    if (open) {
      first.current?.focus();
    } else if (opened.current) {
      opener.current?.focus();
    }
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const day = formText(form, 'day').trim();
    const chat = formText(form, 'chat').trim();
    const answer = await write.run(
      () =>
        leaving
          ? markLeft(personId, day === '' ? {} : { leftOn: day })
          : markJoined(personId, {
              ...(day === '' ? {} : { joinedOn: day }),
              ...(chat === '' ? {} : { chat }),
            }),
      { done: leaving ? t.leftDone : t.joinedDone },
    );
    if (answer?.ok) {
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <div>
        <button
          ref={opener}
          type="button"
          className={ui.secondaryButton}
          onClick={() => {
            opened.current = true;
            write.clear();
            setOpen(true);
          }}
        >
          {leaving ? t.hasLeft : t.hasJoined}
        </button>
      </div>
    );
  }

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="presencia-dia">
          {leaving ? t.leftDate : t.joinedDate}
        </label>
        <input
          ref={first}
          id="presencia-dia"
          className={ui.input}
          type="date"
          name="day"
          aria-describedby="presencia-hint"
        />
        <span id="presencia-hint" className={ui.hint}>
          {t.dateHint}
        </span>
      </div>
      {leaving ? null : (
        <div className={ui.field}>
          <label className={ui.label} htmlFor="presencia-chat">
            {t.chat}
          </label>
          <input
            id="presencia-chat"
            className={ui.input}
            name="chat"
            list="presencia-chats"
            maxLength={100}
            autoComplete="off"
          />
          <datalist id="presencia-chats">
            {chats.map((chat) => (
              <option key={chat} value={chat}>
                {chat}
              </option>
            ))}
          </datalist>
        </div>
      )}
      <FormError message={write.error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {leaving ? t.confirmLeft : t.confirmJoined}
        </button>
        <button type="button" className={ui.textButton} onClick={() => setOpen(false)}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
};
