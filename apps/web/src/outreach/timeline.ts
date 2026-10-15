import type { getTranslator } from '@backoffice/i18n/messages';

import type { Described } from '@/onboarding/timeline';

import { type ContactEvent, isRelationshipStage, isTargetStatus } from './types';

type Translator = ReturnType<typeof getTranslator>;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * An outreach timeline event in words (the database's `contact_event_kind`): stages and statuses by name, owners by
 * name (`staffName`, from the team list), the campaign by name (`campaignName`, from the contact's campaigns). An event
 * of a kind the page doesn't know still says something changed.
 */
export const describeContactEvent = (
  event: Pick<ContactEvent, 'kind' | 'body' | 'data' | 'campaignId'>,
  {
    t,
    staffName,
    campaignName,
  }: {
    t: Translator;
    staffName: (userId: string) => string | undefined;
    campaignName: (campaignId: string) => string | undefined;
  },
): Described => {
  const { data } = event;
  const body = text(event.body) ?? null;
  const stage = (value: unknown): string =>
    isRelationshipStage(value) ? t(`outreach.stages.${value}`) : '—';
  const status = (value: unknown): string =>
    isTargetStatus(value) ? t(`outreach.statuses.${value}`) : '—';
  const person = (value: unknown): string => {
    const id = text(value);
    return id === undefined
      ? t('outreach.events.someone')
      : (staffName(id) ?? t('outreach.events.someone'));
  };
  const campaign =
    (event.campaignId === null ? undefined : campaignName(event.campaignId)) ??
    t('outreach.events.aCampaign');
  switch (event.kind) {
    case 'created':
      return { title: t('outreach.events.created', { stage: stage(data.stage) }), detail: null };
    case 'imported':
      return { title: t('outreach.events.imported', { stage: stage(data.stage) }), detail: null };
    case 'note':
      return { title: t('outreach.events.note'), detail: body };
    case 'stage_changed':
      return {
        title: t('outreach.events.stage_changed', { from: stage(data.from), to: stage(data.to) }),
        detail: null,
      };
    case 'owner_changed':
      return {
        title:
          text(data.to) === undefined
            ? t('outreach.events.owner_removed', { from: person(data.from) })
            : t('outreach.events.owner_changed', { to: person(data.to) }),
        detail: null,
      };
    case 'status_changed':
      return {
        title: t('outreach.events.status_changed', {
          campaign,
          from: status(data.from),
          to: status(data.to),
        }),
        detail: body,
      };
    case 'sent': {
      const version = data.templateVersion;
      return {
        title:
          typeof version === 'number'
            ? t('outreach.events.sentVersion', { campaign, version })
            : t('outreach.events.sent', { campaign }),
        detail: body,
      };
    }
    case 'reviewed':
      return { title: t('outreach.events.reviewed'), detail: null };
    default:
      return { title: t('outreach.events.unknown'), detail: body };
  }
};
