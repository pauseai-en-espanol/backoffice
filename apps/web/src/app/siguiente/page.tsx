import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { isUnavailable } from '@/data';
import { NextAction } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { ClaimTarget } from '@/outreach/ClaimTarget';
import { ContactFlags } from '@/outreach/ContactItem';
import { getCampaigns, getNext } from '@/outreach/data';
import { nextFiltersFromPage, nextPageQuery } from '@/outreach/filters';
import { contactName, priorityLabel } from '@/outreach/format';
import { LetterView } from '@/outreach/LetterView';
import { OutreachOnly } from '@/outreach/OutreachOnly';
import { SentQuestion } from '@/outreach/SentQuestion';
import { TargetHeading } from '@/outreach/TargetHeading';
import {
  campaignStatusNames,
  canOutreach,
  letterWords,
  outreachErrors,
  summaryWords,
} from '@/outreach/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('siguiente.title') };

/**
 * Siguiente (outreach spec §3, §5): the owner's next target, theirs or nobody's, in send order, in one campaign or all
 * active ones. The letter as the API wrote it, its sources to check and what to look at; the sender's own mail
 * (`mailto:`), copy buttons or WhatsApp to send it; then "¿La has enviado?". A target nobody holds is taken first ("Me
 * lo quedo"), so two people never write the same letter. "Ahora no" leaves the target for later in this visit, which
 * the page's address keeps (`saltar`). A person always sends: nothing on this page sends anything.
 */
const NextPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const me = await requireStaff();
  if (!canOutreach(me)) {
    return (
      <AppShell me={me}>
        <OutreachOnly />
      </AppShell>
    );
  }
  const filters = nextFiltersFromPage(await searchParams);
  const [next, campaigns] = await Promise.all([getNext(filters), getCampaigns()]);
  const statuses = campaignStatusNames(t);
  // Any campaign that isn't closed may be chosen; the API serves all active ones without a choice.
  const choices = isUnavailable(campaigns)
    ? []
    : campaigns.filter(
        (campaign) => campaign.status !== 'closed' || campaign.id === filters.campaign,
      );
  const words = summaryWords(t);
  const letter = letterWords(t);
  const raw = (key: Parameters<typeof t.raw>[0]) => String(t.raw(key));

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('siguiente.title')}</h1>
      <p className={styles.text}>{t('siguiente.intro')}</p>
      <form method="get" action="/siguiente" className={onboarding.filters} role="search">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="campana">
            {t('siguiente.campaign')}
          </label>
          <select
            id="campana"
            name="campana"
            className={onboarding.select}
            defaultValue={filters.campaign}
          >
            <option value="">{t('siguiente.allCampaigns')}</option>
            {choices.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.status === 'active'
                  ? campaign.name
                  : `${campaign.name} (${statuses[campaign.status]})`}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.rowActions} data-wide="">
          <button type="submit" className={styles.button}>
            {t('siguiente.show')}
          </button>
        </div>
      </form>
      <Announcer>
        {isUnavailable(next) ? (
          <p className={styles.notice}>{t('web.unavailable.body')}</p>
        ) : (
          <>
            <p className={styles.text}>
              {t('siguiente.remaining', { remaining: next.remaining })}
              {next.blocked > 0 ? (
                <>
                  {' '}
                  {t('siguiente.blocked', { blocked: next.blocked })}{' '}
                  <Link className={styles.link} href="/contactos?revisar=si">
                    {t('siguiente.toBlocked')}
                  </Link>
                </>
              ) : null}
            </p>
            {next.target === null || next.campaign === null ? (
              <>
                <p className={styles.notice}>
                  {filters.skip.length > 0 ? t('siguiente.noneSkipped') : t('siguiente.none')}
                </p>
                {filters.skip.length > 0 ? (
                  <p>
                    <Link
                      className={styles.secondaryButton}
                      href={`/siguiente${nextPageQuery({ campaign: filters.campaign, skip: [] })}`}
                    >
                      {t('siguiente.startAgain')}
                    </Link>
                  </p>
                ) : null}
              </>
            ) : (
              <section aria-labelledby="destinatario">
                <TargetHeading
                  id="destinatario"
                  targetId={next.target.id}
                  focusOnMount={filters.skip.length > 0}
                >
                  {contactName(next.target.contact, words)}
                </TargetHeading>
                <p>
                  {next.target.contact.orgDisplay}
                  {next.target.contact.role ? ` · ${next.target.contact.role}` : ''}
                </p>
                <ul className={onboarding.meta}>
                  <li>
                    {t('siguiente.inCampaign')}:{' '}
                    <Link
                      className={styles.link}
                      href={`/campanas/${encodeURIComponent(next.campaign.id)}`}
                    >
                      {next.campaign.name}
                    </Link>
                  </li>
                  <li>{t('outreach.summary.tier', { tier: next.target.contact.tier })}</li>
                  <li>
                    {priorityLabel(next.target.priority, {
                      priority: raw('campaigns.priorityValue'),
                      none: t('campaigns.noPriority'),
                    })}
                  </li>
                  <li>{t(`outreach.statuses.${next.target.status}`)}</li>
                  <li>
                    {words.owner}: {next.target.owner?.displayName || words.noOwner}
                  </li>
                </ul>
                <ContactFlags contact={next.target.contact} words={words} />
                {next.target.nextAction ? (
                  <p>
                    <span className={styles.muted}>{t('campaigns.nextAction')}: </span>
                    <NextAction
                      text={next.target.nextAction}
                      due={next.target.nextActionDue}
                      labels={{
                        noNextAction: t('campaigns.noNextAction'),
                        overdue: raw('campaigns.overdue'),
                        due: raw('campaigns.due'),
                        dueToday: t('campaigns.dueToday'),
                      }}
                    />
                  </p>
                ) : null}
                <ul className={styles.linkList}>
                  <li>
                    <Link
                      className={styles.link}
                      href={`/contactos/${encodeURIComponent(next.target.contact.id)}`}
                    >
                      {t('siguiente.toContact')}
                    </Link>
                  </li>
                  <li>
                    <Link
                      className={styles.link}
                      href={`/campanas/${encodeURIComponent(next.campaign.id)}`}
                    >
                      {t('siguiente.toCampaign')}
                    </Link>
                  </li>
                </ul>
                <h3 className={styles.h3}>{letter.title}</h3>
                {next.handover === null ? (
                  <p className={styles.notice}>{t('web.unavailable.body')}</p>
                ) : (
                  <LetterView
                    handover={next.handover}
                    text={letter}
                    links={{
                      contact: `/contactos/${encodeURIComponent(next.target.contact.id)}`,
                      campaign: `/campanas/${encodeURIComponent(next.campaign.id)}`,
                    }}
                    sending={next.target.owner?.userId === me.user.id}
                  />
                )}
                {next.target.owner?.userId === me.user.id ? null : (
                  <ClaimTarget
                    targetId={next.target.id}
                    skipHref={`/siguiente${nextPageQuery({
                      campaign: filters.campaign,
                      skip: [...filters.skip, next.target.id],
                    })}`}
                    text={{
                      intro: t('siguiente.claimIntro'),
                      claim: t('siguiente.claim'),
                      claimed: t('siguiente.claimed'),
                      taken: t('siguiente.taken'),
                      notNow: t('siguiente.notNow'),
                      skipped: t('siguiente.skipped'),
                      errors: outreachErrors(t),
                    }}
                  />
                )}
                {next.target.owner?.userId !== me.user.id ? null : (
                  <SentQuestion
                    targetId={next.target.id}
                    templateVersion={next.handover?.templateVersion ?? null}
                    sendable={next.handover?.letter.ok === true}
                    skipHref={`/siguiente${nextPageQuery({
                      campaign: filters.campaign,
                      skip: [...filters.skip, next.target.id],
                    })}`}
                    text={{
                      sentQuestion: t('siguiente.sentQuestion'),
                      sentHint: t('siguiente.sentHint'),
                      yes: t('siguiente.yes'),
                      notNow: t('siguiente.notNow'),
                      notNowHint: t('siguiente.notNowHint'),
                      skip: t('siguiente.skip'),
                      skipHint: t('siguiente.skipHint'),
                      logged: t('siguiente.logged'),
                      alreadySent: t('siguiente.alreadySent'),
                      skipped: t('siguiente.skipped'),
                      errors: outreachErrors(t),
                    }}
                  />
                )}
              </section>
            )}
          </>
        )}
      </Announcer>
    </AppShell>
  );
};

export default NextPage;
