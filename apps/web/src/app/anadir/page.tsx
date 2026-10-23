import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { isUnavailable } from '@/data';
import { getArrivalChannels, getSettings } from '@/onboarding/data';
import { madridToday } from '@/onboarding/format';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { placeText } from '@/onboarding/place/text';
import { QuickAddForm } from '@/onboarding/QuickAddForm';
import { canOnboard, onboardingErrors, stageNames } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('intake.title') };

/** Añadir rápido (onboarding spec, intake: web): for whoever prefers it to the bot. */
const QuickAddPage = async () => {
  const me = await requireStaff();
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <OnboardingOnly />
      </AppShell>
    );
  }
  const [settings, channels] = await Promise.all([getSettings(), getArrivalChannels()]);
  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('intake.title')}</h1>
      <p className={styles.text}>{t('intake.intro')}</p>
      <QuickAddForm
        chats={isUnavailable(settings) ? [] : settings.communityChats}
        channels={isUnavailable(channels) ? [] : channels.filter((channel) => channel.active)}
        today={madridToday()}
        text={{
          name: t('intake.name'),
          nameHint: t('intake.nameHint'),
          noName: t('people.noName'),
          phone: t('intake.phone'),
          phoneHint: t('intake.phoneHint'),
          email: t('intake.email'),
          discord: t('intake.discord'),
          discordHint: t('intake.discordHint'),
          discordInvalid: t('intake.discordInvalid'),
          contactHint: t('intake.contactHint'),
          arrival: t('intake.arrival'),
          arrivalHint: t('intake.arrivalHint'),
          arrivalNone: t('intake.arrivalNone'),
          arrivedOn: t('intake.arrivedOn'),
          arrivedOnHint: t('intake.arrivedOnHint'),
          place: placeText(t),
          livesIn: t('person.profileWhere'),
          from: t('person.profileFrom'),
          addFrom: t('intake.addFrom'),
          chat: t('intake.chat'),
          chatHint: t('intake.chatHint'),
          stage: t('intake.stage'),
          stageHint: t('intake.stageHint'),
          note: t('intake.note'),
          noteWarning: t('person.notesWarning'),
          submit: t('intake.submit'),
          checking: t('intake.checking'),
          candidatesTitle: t('intake.candidatesTitle'),
          candidatesIntro: t('intake.candidatesIntro'),
          candidateExact: t('intake.candidateExact'),
          candidateSimilar: t('intake.candidateSimilar'),
          isThisPerson: String(t.raw('intake.isThisPerson')),
          isNew: t('intake.isNew'),
          chooseFirst: t('intake.chooseFirst'),
          contactMissing: t('intake.contactMissing'),
          phoneInvalid: t('intake.phoneInvalid'),
          emailInvalid: t('intake.emailInvalid'),
          willBe: String(t.raw('intake.willBe')),
          review: t('intake.review'),
          conflict: t('intake.conflict'),
          toPerson: t('intake.toPerson'),
          toBandeja: t('intake.toBandeja'),
          stages: stageNames(t),
          errors: onboardingErrors(t),
        }}
      />
    </AppShell>
  );
};

export default QuickAddPage;
