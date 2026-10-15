import type { Metadata } from 'next';

import { MERGE_FIELDS } from '@backoffice/domain/outreach';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';
import { Fragment } from 'react';

import { isUnavailable } from '@/data';
import { isForbidden } from '@/onboarding/data';
import { formatInstant, formatInstantDay } from '@/onboarding/format';
import { NextAction } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { AddTargets } from '@/outreach/AddTargets';
import { AnchorEditor } from '@/outreach/AnchorEditor';
import {
  addTargetsText,
  anchorText,
  campaignFormText,
  previewText,
  targetActionsText,
  templateText,
} from '@/outreach/campaign-text';
import { CampaignEditor } from '@/outreach/CampaignForm';
import { ContactItem } from '@/outreach/ContactItem';
import { getCampaign } from '@/outreach/data';
import { nextPageQuery } from '@/outreach/filters';
import {
  contactName,
  groupByStatus,
  priorityLabel,
  queuePositions,
  TEMPLATE_TIERS,
} from '@/outreach/format';
import { OutreachForbidden, OutreachOnly, Unavailable } from '@/outreach/OutreachOnly';
import { Preview } from '@/outreach/Preview';
import * as outreach from '@/outreach/styles';
import { TargetActions } from '@/outreach/TargetActions';
import { TemplateEditor } from '@/outreach/TemplateEditor';
import {
  campaignStatusNames,
  canOutreach,
  letterWords,
  outreachOwners,
  statusNames,
  summaryWords,
} from '@/outreach/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('campaigns.title') };

/**
 * A campaign (outreach spec §5): its details; its targets by status, in send order, each changed in place; adding
 * contacts from the directory; its templates by tier, with the merge fields they may use; its evidence paragraphs; and
 * a preview of the letter any contact would get. Sending happens in Siguiente, never here.
 */
const CampaignPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const me = await requireStaff();
  if (!canOutreach(me)) {
    return (
      <AppShell me={me}>
        <OutreachOnly />
      </AppShell>
    );
  }
  const { id } = await params;
  const [page, team] = await Promise.all([getCampaign(id), getTeam()]);
  if (isForbidden(page) || isUnavailable(page)) {
    return (
      <AppShell me={me}>{isForbidden(page) ? <OutreachForbidden /> : <Unavailable />}</AppShell>
    );
  }

  const { campaign, templates, anchors, targets } = page;
  const owners = outreachOwners(isUnavailable(team) ? [] : team.staff);
  const words = summaryWords(t);
  const statuses = statusNames(t);
  const positions = queuePositions(targets);
  const raw = (key: Parameters<typeof t.raw>[0]) => String(t.raw(key));
  const dueLabels = {
    noNextAction: t('campaigns.noNextAction'),
    overdue: raw('campaigns.overdue'),
    due: raw('campaigns.due'),
    dueToday: t('campaigns.dueToday'),
  };
  const anchorChoices = anchors.map(({ key, label }) => ({ key, label }));

  return (
    <AppShell me={me}>
      <Announcer>
        <p>
          <Link className={styles.link} href="/campanas">
            {t('campaigns.back')}
          </Link>
        </p>
        <h1 className={styles.h1}>{campaign.name}</h1>
        <ul className={onboarding.meta}>
          <li>
            <span className={onboarding.stage}>{campaignStatusNames(t)[campaign.status]}</span>
          </li>
          <li>{campaign.slug}</li>
          <li>
            {t('campaigns.owner')}: {campaign.owner?.displayName || t('campaigns.noOwner')}
          </li>
          {campaign.createdAt ? (
            <li>{t('campaigns.createdOn', { date: formatInstantDay(campaign.createdAt) })}</li>
          ) : null}
        </ul>
        <p>
          <Link
            className={styles.button}
            href={`/siguiente${nextPageQuery({ campaign: campaign.id, skip: [] })}`}
          >
            {t('campaigns.toNext')}
          </Link>
        </p>

        <section id="datos" className={onboarding.section} aria-labelledby="datos-titulo">
          <h2 id="datos-titulo" className={styles.h3}>
            {t('campaigns.details')}
          </h2>
          <dl className={styles.facts}>
            <dt>{t('campaigns.goal')}</dt>
            <dd className={onboarding.timelineBody}>{campaign.goal ?? t('campaigns.noGoal')}</dd>
            <dt>{t('campaigns.language')}</dt>
            <dd>{campaign.language}</dd>
            {campaign.fromName || campaign.fromEmail ? (
              <>
                <dt>{t('campaigns.fromName')}</dt>
                <dd>
                  {[campaign.fromName, campaign.fromEmail ? `<${campaign.fromEmail}>` : null]
                    .filter(Boolean)
                    .join(' ')}
                </dd>
              </>
            ) : null}
            <dt>{t('campaigns.signature')}</dt>
            <dd className={onboarding.timelineBody}>
              {campaign.signature || t('campaigns.noSignature')}
            </dd>
          </dl>
          <CampaignEditor campaign={campaign} owners={owners} text={campaignFormText(t)} />
        </section>

        <section id="destinatarios" aria-labelledby="destinatarios-titulo">
          <h2 id="destinatarios-titulo" className={styles.h2}>
            {t('campaigns.targets')}
          </h2>
          <p className={styles.text}>{t('campaigns.targetsIntro')}</p>
          {targets.length === 0 ? (
            <p className={styles.text}>{t('campaigns.targetsNone')}</p>
          ) : (
            groupByStatus(targets).map(({ status, targets: group }) => (
              <Fragment key={status}>
                <h3 className={outreach.groupHeading}>
                  {statuses[status]}
                  <span className={styles.muted}>({group.length})</span>
                </h3>
                <ul className={onboarding.personList}>
                  {group.map((target) => {
                    const name = contactName(target.contact, words);
                    const position = positions.get(target.id);
                    return (
                      <ContactItem
                        key={target.id}
                        contact={target.contact}
                        words={words}
                        showOwner={false}
                      >
                        <ul className={onboarding.meta}>
                          {position === undefined ? null : (
                            <li>{t('campaigns.queuePosition', { position: String(position) })}</li>
                          )}
                          <li>
                            {priorityLabel(target.priority, {
                              priority: raw('campaigns.priorityValue'),
                              none: t('campaigns.noPriority'),
                            })}
                          </li>
                          <li>
                            {t('campaigns.owner')}:{' '}
                            {target.owner?.displayName || t('campaigns.noOwner')}
                          </li>
                          {target.anchor ? (
                            <li>
                              {t('campaigns.anchor')}: {target.anchor}
                            </li>
                          ) : null}
                          {target.sentAt ? (
                            <li>{t('campaigns.sentAt', { date: formatInstant(target.sentAt) })}</li>
                          ) : null}
                          {target.repliedAt ? (
                            <li>
                              {t('campaigns.repliedAt', { date: formatInstant(target.repliedAt) })}
                            </li>
                          ) : null}
                          {target.meetingAt ? (
                            <li>
                              {t('campaigns.meetingAt', { date: formatInstant(target.meetingAt) })}
                            </li>
                          ) : null}
                        </ul>
                        <p>
                          <span className={styles.muted}>{t('campaigns.nextAction')}: </span>
                          <NextAction
                            text={target.nextAction}
                            due={target.nextActionDue}
                            labels={dueLabels}
                          />
                        </p>
                        <TargetActions
                          target={target}
                          anchors={anchorChoices}
                          owners={owners}
                          text={targetActionsText(t, name)}
                        />
                      </ContactItem>
                    );
                  })}
                </ul>
              </Fragment>
            ))
          )}
          <section className={onboarding.section} aria-labelledby="anadir">
            <h3 id="anadir" className={styles.h3}>
              {t('campaigns.add')}
            </h3>
            <AddTargets
              campaignId={campaign.id}
              inCampaign={targets.map((target) => target.contact.id)}
              text={addTargetsText(t)}
            />
          </section>
        </section>

        <section id="plantillas" aria-labelledby="plantillas-titulo">
          <h2 id="plantillas-titulo" className={styles.h2}>
            {t('campaigns.templates')}
          </h2>
          <p className={styles.text}>{t('campaigns.templatesIntro')}</p>
          <div className={onboarding.section}>
            <h3 className={styles.h3}>{t('campaigns.mergeFields')}</h3>
            <dl className={styles.facts}>
              {MERGE_FIELDS.map((field) => (
                <Fragment key={field}>
                  <dt>
                    <code>{`{{${field}}}`}</code>
                  </dt>
                  <dd>{t(`campaigns.mergeFieldHelp.${field}`)}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
          {TEMPLATE_TIERS.map((tier) => {
            const template = templates.find((item) => item.tier === tier) ?? null;
            return (
              <div key={tier} className={onboarding.section}>
                <TemplateEditor
                  campaignId={campaign.id}
                  tier={tier}
                  template={template}
                  version={
                    template === null
                      ? null
                      : template.updatedAt
                        ? t('campaigns.version', {
                            version: String(template.version),
                            date: formatInstantDay(template.updatedAt),
                          })
                        : t('campaigns.versionOnly', { version: String(template.version) })
                  }
                  text={templateText(t)}
                />
              </div>
            );
          })}
        </section>

        <section id="parrafos" aria-labelledby="parrafos-titulo">
          <h2 id="parrafos-titulo" className={styles.h2}>
            {t('campaigns.anchors')}
          </h2>
          <p className={styles.text}>{t('campaigns.anchorsIntro')}</p>
          <AnchorEditor campaignId={campaign.id} anchors={anchors} text={anchorText(t)} />
        </section>

        <section
          id="vista-previa"
          className={onboarding.section}
          aria-labelledby="vista-previa-titulo"
        >
          <h2 id="vista-previa-titulo" className={styles.h3}>
            {t('campaigns.preview')}
          </h2>
          <p className={styles.hint}>{t('campaigns.previewIntro')}</p>
          <Preview
            campaignId={campaign.id}
            targets={targets.map((target) => ({
              id: target.contact.id,
              label: `${contactName(target.contact, words)} · ${target.contact.orgDisplay}`,
            }))}
            text={previewText(t)}
            letter={letterWords(t)}
          />
        </section>
      </Announcer>
    </AppShell>
  );
};

export default CampaignPage;
