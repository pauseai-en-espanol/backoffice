'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ConfirmAction } from '@/ui/ConfirmAction';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { linkTelegram, unlinkTelegram } from '../actions';

export interface TelegramLinkText {
  connect: string;
  opened: string;
  openAgain: string;
  refresh: string;
  disconnect: string;
  confirmDisconnect: string;
  disconnected: string;
  confirm: string;
  cancel: string;
  errors: Readonly<Record<string, string>>;
}

/** Only a link to Telegram is ever opened: whatever the API answers, nothing else leaves the page. */
const isTelegramLink = (url: unknown): url is string =>
  typeof url === 'string' && /^https:\/\/t\.me\/\w+\?start=[\w-]+$/u.test(url);

/**
 * Linking the staff member's Telegram account to the bot (ADR-0004): a one-time code, valid 10 minutes, opened in
 * Telegram as `https://t.me/<bot>?start=<code>`, where pressing "Iniciar" finishes it. The link is also shown, in case
 * the browser didn't open it. Unlinking asks first.
 */
export const TelegramLink = ({ linked, text }: { linked: boolean; text: TelegramLinkText }) => {
  const router = useRouter();
  const write = useWrite(text.errors);
  const [url, setUrl] = useState<string>();
  const notice = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (url) {
      notice.current?.focus();
    }
  }, [url]);

  if (linked) {
    return (
      <ConfirmAction
        label={text.disconnect}
        text={{
          question: text.confirmDisconnect,
          confirm: text.confirm,
          cancel: text.cancel,
          done: text.disconnected,
          errors: text.errors,
        }}
        run={unlinkTelegram}
      />
    );
  }

  return (
    <div className={ui.form}>
      <div>
        <button
          type="button"
          className={ui.button}
          aria-disabled={write.pending}
          onClick={async () => {
            const answer = await write.run(linkTelegram, { refresh: false });
            const link = answer?.ok ? answer.body.url : undefined;
            if (isTelegramLink(link)) {
              // A browser that blocks it still has the link shown below.
              window.open(link, '_blank', 'noopener,noreferrer');
              setUrl(link);
            }
          }}
        >
          {text.connect}
        </button>
      </div>
      {url ? (
        <div ref={notice} tabIndex={-1} className={ui.notice} role="status">
          <p>{text.opened}</p>
          <p>
            <a className={ui.link} href={url} target="_blank" rel="noopener noreferrer">
              {text.openAgain}
            </a>
          </p>
          <button type="button" className={ui.secondaryButton} onClick={() => router.refresh()}>
            {text.refresh}
          </button>
        </div>
      ) : null}
      <FormError message={write.error} />
    </div>
  );
};
