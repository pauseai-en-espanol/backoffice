import { messages } from '@backoffice/i18n/catalog';
import { connection } from 'next/server';

import { privacyNoticeUrl } from '@/config';
import * as styles from '@/ui/styles';

import { CensusLoader } from './CensusLoader';

/**
 * A census page: its heading and, on the generic one, what the census is for; the form itself is rendered in the
 * browser. The words go to the client as they are, with the deployment's privacy notice address.
 */
export const CensusPage = async ({ personal }: { personal: boolean }) => {
  await connection();
  const { privacy: _privacy, ...text } = messages.es.census;
  return (
    <main className={styles.narrow}>
      <h1 className={styles.h1}>{text.title}</h1>
      {personal ? null : <p className={styles.text}>{text.intro}</p>}
      <noscript>
        <p className={styles.notice}>{text.unavailable}</p>
      </noscript>
      <CensusLoader
        personal={personal}
        text={text}
        availability={messages.es.availability}
        privacyUrl={privacyNoticeUrl()}
      />
    </main>
  );
};
