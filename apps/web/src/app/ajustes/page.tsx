import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { isUnavailable } from '@/data';
import { getCensusOptions } from '@/onboarding/census/data';
import { sortOptions } from '@/onboarding/census/format';
import { OptionsEditor, type OptionsEditorText } from '@/onboarding/census/OptionsEditor';
import * as census from '@/onboarding/census/styles';
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
 * onboarding settings, which admins change; everyone sees the census's lists, which admins edit.
 */
const SettingsPage = async () => {
  const me = await requireStaff();
  const admin = isAdmin(me);
  const onboarder = canOnboard(me);
  const [telegram, settings, options] = await Promise.all([
    getTelegramLink(),
    onboarder ? getSettings() : Promise.resolve(undefined),
    getCensusOptions(),
  ]);
  const errors = onboardingErrors(t);
  const raw = (key: Parameters<typeof t.raw>[0]) => String(t.raw(key));
  const optionsText: OptionsEditorText = {
    none: t('settings.optionsNone'),
    inactive: t('settings.optionInactive'),
    add: t('settings.addOption'),
    newOption: t('settings.newOption'),
    added: t('settings.optionAdded'),
    rename: t('settings.rename'),
    renameFor: raw('settings.renameFor'),
    renameLabel: raw('settings.renameLabel'),
    save: t('settings.saveOption'),
    cancel: t('person.cancel'),
    renamed: t('settings.renamed'),
    up: t('settings.optionUp'),
    down: t('settings.optionDown'),
    moveUp: raw('settings.moveUp'),
    moveDown: raw('settings.moveDown'),
    moved: t('settings.moved'),
    off: t('settings.optionOff'),
    on: t('settings.optionOn'),
    deactivate: raw('settings.deactivate'),
    reactivate: raw('settings.reactivate'),
    deactivated: t('settings.deactivated'),
    reactivated: t('settings.reactivated'),
    missing: t('settings.optionMissing'),
    errors,
  };
  const lists = [
    { kind: 'skill', id: 'habilidades', title: t('settings.skills') },
    { kind: 'interest', id: 'areas', title: t('settings.interests') },
  ] as const;

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
        <section className={onboarding.section} aria-labelledby="listas-censo">
          <h2 id="listas-censo" className={styles.h3}>
            {t('settings.censusOptions')}
          </h2>
          <p className={styles.hint}>{t('settings.censusOptionsIntro')}</p>
          {isUnavailable(options) ? (
            <p className={styles.notice}>{t('web.unavailable.body')}</p>
          ) : (
            <>
              {lists.map(({ kind, id, title }) => {
                const list = options.filter((option) => option.kind === kind);
                return (
                  <section key={kind} aria-labelledby={id}>
                    <h3 id={id} className={styles.h3}>
                      {title}
                    </h3>
                    {admin ? (
                      <OptionsEditor kind={kind} options={list} text={optionsText} />
                    ) : list.length === 0 ? (
                      <p className={styles.hint}>{t('settings.optionsNone')}</p>
                    ) : (
                      <ul className={census.bullets}>
                        {sortOptions(list).map((option) => (
                          <li key={option.id}>
                            {option.label}
                            {option.active ? '' : ` ${t('settings.optionInactive')}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
              {admin ? null : <p className={styles.hint}>{t('settings.optionsReadOnly')}</p>}
            </>
          )}
        </section>
      </Announcer>
    </AppShell>
  );
};

export default SettingsPage;
