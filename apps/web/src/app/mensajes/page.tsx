import type { Metadata } from 'next';

import { MESSAGE_PURPOSES, type MessagePurpose } from '@backoffice/domain/message-templates';
import { getTranslator } from '@backoffice/i18n/messages';

import { isUnavailable } from '@/data';
import { fill } from '@/fill';
import { getMessageTemplates } from '@/onboarding/data';
import { formatInstantDay } from '@/onboarding/format';
import { MessageCard, NewMessage } from '@/onboarding/messages/MessageCard';
import * as messages from '@/onboarding/messages/styles';
import { messagesPageText } from '@/onboarding/messages/text';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import * as onboarding from '@/onboarding/styles';
import { canOnboard } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import { Disclosure } from '@/ui/Disclosure';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('messageTemplates.title') };

/** Where each purpose's sections are named on the page. */
const SECTION_IDS: Readonly<Record<MessagePurpose, string>> = {
  welcome: 'bienvenida',
  census_link: 'enlace-del-censo',
};

/**
 * Mensajes (PLAN M5): the WhatsApp messages newcomers receive, as the onboarding team writes them, by purpose (the
 * welcome, the census link's), those in use in the order they're offered, the retired folded below. With none in use,
 * the page shows the neutral one the code sends instead. Onboarding staff and admins read and write them (ADR-0002).
 */
const MessagesPage = async () => {
  const me = await requireStaff();
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <OnboardingOnly />
      </AppShell>
    );
  }
  const templates = await getMessageTemplates();
  const text = messagesPageText(t);
  const raw = (key: Parameters<typeof t.raw>[0]) => String(t.raw(key));
  const example = {
    name: text.exampleName,
    me: me.staff.displayName,
    url: text.exampleLink,
  };
  const fallbacks: Readonly<Record<MessagePurpose, string>> = {
    welcome: fill(raw('person.whatsappMessage'), example),
    census_link: fill(raw('censusLink.whatsapp'), example),
  };
  const versionOf = (template: {
    version: number;
    updatedAt: string;
    updatedBy: { displayName: string } | null;
  }) =>
    template.updatedBy === null
      ? t('messageTemplates.version', {
          version: template.version,
          date: formatInstantDay(template.updatedAt),
        })
      : t('messageTemplates.versionBy', {
          version: template.version,
          date: formatInstantDay(template.updatedAt),
          who: template.updatedBy.displayName,
        });

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('messageTemplates.title')}</h1>
      <p className={styles.text}>{t('messageTemplates.intro')}</p>
      {isUnavailable(templates) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : (
        <Announcer>
          {MESSAGE_PURPOSES.map((purpose) => {
            const ofPurpose = templates.filter((template) => template.purpose === purpose);
            const inUse = ofPurpose.filter((template) => template.active);
            const retired = ofPurpose.filter((template) => !template.active);
            const id = SECTION_IDS[purpose];
            return (
              <section key={purpose} className={onboarding.section} aria-labelledby={id}>
                <h2 id={id} className={styles.h2}>
                  {text.purposes[purpose]}
                </h2>
                <p className={styles.text}>{text.purposeHints[purpose]}</p>
                {inUse.length === 0 ? (
                  <>
                    <p className={styles.notice}>{t('messageTemplates.none')}</p>
                    <div>
                      <p className={styles.label}>{t('messageTemplates.fallback')}</p>
                      <div className={messages.message}>{fallbacks[purpose]}</div>
                    </div>
                  </>
                ) : (
                  <>
                    {inUse.length > 1 ? (
                      <p className={styles.hint}>{t('messageTemplates.first')}</p>
                    ) : null}
                    <ol className={messages.list}>
                      {inUse.map((template) => (
                        <li key={template.id}>
                          <MessageCard
                            template={template}
                            version={versionOf(template)}
                            me={me.staff.displayName}
                            text={text}
                          />
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                <NewMessage purpose={purpose} me={me.staff.displayName} text={text} />
                {retired.length === 0 ? null : (
                  <Disclosure
                    id={`${id}-retirados`}
                    label={t('messageTemplates.retiredList', { count: retired.length })}
                  >
                    <ul className={messages.list}>
                      {retired.map((template) => (
                        <li key={template.id}>
                          <MessageCard
                            template={template}
                            version={versionOf(template)}
                            me={me.staff.displayName}
                            text={text}
                          />
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}
              </section>
            );
          })}
        </Announcer>
      )}
    </AppShell>
  );
};

export default MessagesPage;
