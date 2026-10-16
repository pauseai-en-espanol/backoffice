import { getTranslator } from '@backoffice/i18n/messages';

import { formatDay, formatInstant } from '@/onboarding/format';
import * as styles from '@/ui/styles';

const t = getTranslator();

/**
 * When a timeline entry happened and who wrote it when (PLAN M5, step 6): "Fue el 1 de marzo de 2026" when someone
 * gave the day, then who, and when they wrote it.
 */
export const EntryWhen = ({
  happenedOn,
  at,
  who,
  viaBot,
}: {
  happenedOn: string | null;
  at: string;
  who: string;
  viaBot: boolean;
}) => (
  <>
    {happenedOn ? (
      <span className={styles.block}>
        <time dateTime={happenedOn}>{t('timeline.happened', { date: formatDay(happenedOn) })}</time>
      </span>
    ) : null}
    <span className={`${styles.block} ${styles.hint}`}>
      {who}
      {viaBot ? ` ${t('outreach.events.viaBot')}` : ''} ·{' '}
      <time dateTime={at}>
        {happenedOn ? t('timeline.recorded', { date: formatInstant(at) }) : formatInstant(at)}
      </time>
    </span>
  </>
);
