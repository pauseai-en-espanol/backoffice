import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { isUnavailable } from '@/data';
import { getSettings, getTelegramLink } from '@/onboarding/data';
import { SettingsForm } from '@/onboarding/settings/SettingsForm';
import { TelegramLink } from '@/onboarding/settings/TelegramLink';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, isAdmin, onboardingErrors } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('settings.title') };

/**
 * Ajustes: everyone links (or unlinks) their Telegram account to the bot (ADR-0004); onboarding staff see the
 * onboarding settings, which admins change.
 */
const SettingsPage = async () => {
  const me = await requireStaff();
  const admin = isAdmin(me);
  const onboarder = canOnboard(me);
  const [telegram, settings] = await Promise.all([
    getTelegramLink(),
    onboarder ? getSettings() : Promise.resolve(undefined),
  ]);
  const errors = onboardingErrors(t);

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('settings.title')}</h1>
      <p className={styles.text}>{t('settings.intro')}</p>
      <Announcer>
        <section className={onboarding.section} aria-labelledby="telegram">
          <h2 id="telegram" className={styles.h3}>
            {t('telegramLink.title')}
          </h2>
          <p className={styles.hint}>{t('telegramLink.intro')}</p>
          {isUnavailable(telegram) ? (
            <p className={styles.notice}>{t('web.unavailable.body')}</p>
          ) : !telegram.configured ? (
            <p className={styles.notice}>{t('telegramLink.notConfigured')}</p>
          ) : (
            <>
              <p>
                {telegram.linked
                  ? t('telegramLink.linked', { bot: telegram.botUsername ?? '' })
                  : t('telegramLink.notLinked')}
              </p>
              <TelegramLink
                linked={telegram.linked}
                text={{
                  connect: t('telegramLink.connect'),
                  opened: t('telegramLink.opened'),
                  openAgain: t('telegramLink.openAgain'),
                  refresh: t('telegramLink.refresh'),
                  disconnect: t('telegramLink.disconnect'),
                  confirmDisconnect: t('telegramLink.confirmDisconnect'),
                  disconnected: t('telegramLink.disconnected'),
                  confirm: t('team.confirm'),
                  cancel: t('person.cancel'),
                  errors,
                }}
              />
            </>
          )}
        </section>
        {settings === undefined ? null : (
          <section className={onboarding.section} aria-labelledby="acogida">
            <h2 id="acogida" className={styles.h3}>
              {t('settings.rules')}
            </h2>
            <p className={styles.hint}>{t('settings.rulesIntro')}</p>
            {isUnavailable(settings) ? (
              <p className={styles.notice}>{t('web.unavailable.body')}</p>
            ) : admin ? (
              <SettingsForm
                settings={settings}
                text={{
                  followUpDays: t('settings.followUpDays'),
                  unresponsiveAttempts: t('settings.unresponsiveAttempts'),
                  unresponsiveDays: t('settings.unresponsiveDays'),
                  unassignedAlertHours: t('settings.unassignedAlertHours'),
                  matchThreshold: t('settings.matchThreshold'),
                  matchThresholdHint: t('settings.matchThresholdHint'),
                  communityChats: t('settings.communityChats'),
                  communityChatsHint: t('settings.communityChatsHint'),
                  save: t('settings.save'),
                  saved: t('settings.saved'),
                  errors,
                }}
              />
            ) : (
              <>
                <dl className={styles.facts}>
                  <dt>{t('settings.followUpDays')}</dt>
                  <dd>{settings.followUpDays}</dd>
                  <dt>{t('settings.unresponsiveAttempts')}</dt>
                  <dd>{settings.unresponsiveAttempts}</dd>
                  <dt>{t('settings.unresponsiveDays')}</dt>
                  <dd>{settings.unresponsiveDays}</dd>
                  <dt>{t('settings.unassignedAlertHours')}</dt>
                  <dd>{settings.unassignedAlertHours}</dd>
                  <dt>{t('settings.matchThreshold')}</dt>
                  <dd>{settings.matchThreshold}</dd>
                  <dt>{t('settings.communityChats')}</dt>
                  <dd>{settings.communityChats.join(', ') || '—'}</dd>
                </dl>
                <p className={styles.hint}>{t('settings.readOnly')}</p>
              </>
            )}
          </section>
        )}
      </Announcer>
    </AppShell>
  );
};

export default SettingsPage;
