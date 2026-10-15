import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';
import { Fragment } from 'react';

import { isUnavailable } from '@/data';
import { formatInstantDay } from '@/onboarding/format';
import * as onboarding from '@/onboarding/styles';
import { campaignFormText } from '@/outreach/campaign-text';
import { NewCampaignForm } from '@/outreach/CampaignForm';
import { getCampaigns } from '@/outreach/data';
import { countsByStatus } from '@/outreach/format';
import { OutreachOnly } from '@/outreach/OutreachOnly';
import { campaignStatusNames, canOutreach, isAdmin, statusNames } from '@/outreach/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('campaigns.title') };

/**
 * Campañas (outreach spec §5): every campaign, with its status, owner and how many targets stand where, each linked to
 * its page; a form to start a new one; and, for admins, importing one from the outreach repo.
 */
const CampaignsPage = async () => {
  const me = await requireStaff();
  if (!canOutreach(me)) {
    return (
      <AppShell me={me}>
        <OutreachOnly />
      </AppShell>
    );
  }
  const campaigns = await getCampaigns();
  const statuses = campaignStatusNames(t);
  const targetStatuses = statusNames(t);

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('campaigns.title')}</h1>
      <p className={styles.text}>{t('campaigns.intro')}</p>
      {isAdmin(me) ? (
        <p className={styles.text}>
          <Link className={styles.secondaryButton} href="/campanas/importar">
            {t('campaigns.import')}
          </Link>{' '}
          <span className={styles.hint}>{t('campaigns.importHint')}</span>
        </p>
      ) : null}
      {isUnavailable(campaigns) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : campaigns.length === 0 ? (
        <p className={styles.text}>{t('campaigns.none')}</p>
      ) : (
        <ul className={onboarding.personList} aria-label={t('campaigns.listLabel')}>
          {campaigns.map((campaign) => {
            const { rows, total } = countsByStatus(campaign.counts);
            return (
              <li key={campaign.id} className={onboarding.personItem}>
                <div className={onboarding.personHead}>
                  <Link
                    className={onboarding.personName}
                    href={`/campanas/${encodeURIComponent(campaign.id)}`}
                  >
                    {campaign.name}
                  </Link>
                  <span className={onboarding.stage}>{statuses[campaign.status]}</span>
                </div>
                <ul className={onboarding.meta}>
                  <li>{campaign.slug}</li>
                  <li>
                    {t('campaigns.owner')}: {campaign.owner?.displayName || t('campaigns.noOwner')}
                  </li>
                  {campaign.createdAt ? (
                    <li>
                      {t('campaigns.createdOn', { date: formatInstantDay(campaign.createdAt) })}
                    </li>
                  ) : null}
                  <li>{t('campaigns.targetsCount', { count: total })}</li>
                </ul>
                {rows.length > 0 ? (
                  <dl className={onboarding.counts}>
                    {rows.map(([status, count]) => (
                      <Fragment key={status}>
                        <dt>{targetStatuses[status]}</dt>
                        <dd>{count}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <section className={onboarding.section} aria-labelledby="nueva">
        <h2 id="nueva" className={styles.h3}>
          {t('campaigns.createTitle')}
        </h2>
        <Announcer>
          <NewCampaignForm text={campaignFormText(t)} />
        </Announcer>
      </section>
    </AppShell>
  );
};

export default CampaignsPage;
