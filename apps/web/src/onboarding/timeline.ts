import type { getTranslator } from '@backoffice/i18n/messages';

import {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  isFormerStage,
  isStage,
  SOURCES,
  type Stage,
} from '@backoffice/domain/stages';

import type { TimelineEvent } from './types';

import { formatDay } from './format';

type Translator = ReturnType<typeof getTranslator>;

export interface Described {
  /** What happened, in a line. */
  title: string;
  /** What someone wrote with it (a note, the next action), if anything. */
  detail: string | null;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

/**
 * A timeline event in words (onboarding spec, concepts: the timeline is what lets someone else pick a person up):
 * stage changes with both stages' names (older history may name the stages PLAN M5 folded, by their old names, and the
 * fold itself says so), owners by name (`staffName`, from the team list), contact attempts with their channel and
 * outcome (and the message, when the team wrote it in Mensajes), sources by name. An event of a kind the page doesn't
 * know still says something changed.
 */
export const describeEvent = (
  event: Pick<TimelineEvent, 'kind' | 'body' | 'data'>,
  {
    t,
    staffName,
    templateTitle = () => undefined,
  }: {
    t: Translator;
    staffName: (userId: string) => string | undefined;
    /** A message's title in Mensajes, by its id (PLAN M5); none when the page doesn't have it. */
    templateTitle?: (templateId: string) => string | undefined;
  },
): Described => {
  const { data } = event;
  const body = text(event.body) ?? null;
  const stage = (value: unknown): string =>
    isStage(value)
      ? t(`stages.${value as Stage}`)
      : isFormerStage(value)
        ? t(`formerStages.${value}`)
        : '—';
  const person = (value: unknown): string => {
    const id = text(value);
    return id === undefined ? t('timeline.someone') : (staffName(id) ?? t('timeline.someone'));
  };
  const source = (value: unknown): string => {
    const known = oneOf(SOURCES, value);
    return known === undefined ? (text(value) ?? '—') : t(`sources.${known}`);
  };
  switch (event.kind) {
    case 'created':
      return { title: t('timeline.created', { stage: stage(data.stage) }), detail: null };
    case 'note':
      return { title: t('timeline.note'), detail: body };
    case 'contact_attempt': {
      const channel = oneOf(CONTACT_CHANNELS, data.channel);
      const outcome = oneOf(CONTACT_OUTCOMES, data.outcome);
      const how = {
        channel: channel === undefined ? '—' : t(`contactChannels.${channel}`),
        outcome: outcome === undefined ? '—' : t(`contactOutcomes.${outcome}`),
      };
      // The message that went out, when the team wrote it in Mensajes (PLAN M5): by its title, if it's known here.
      const templateId = text(data.templateId);
      const version = data.templateVersion;
      if (templateId === undefined || typeof version !== 'number') {
        return { title: t('timeline.contact_attempt', how), detail: body };
      }
      const title = templateTitle(templateId);
      return {
        title:
          title === undefined
            ? t('timeline.contact_attempt_team_message', { ...how, version })
            : t('timeline.contact_attempt_message', { ...how, version, title }),
        detail: body,
      };
    }
    case 'stage_changed':
      return {
        title: t('timeline.stage_changed', { from: stage(data.from), to: stage(data.to) }),
        detail: data.stages_folded === true ? t('timeline.stagesFolded') : null,
      };
    case 'owner_changed':
      return {
        title:
          text(data.to) === undefined
            ? t('timeline.owner_removed', { from: person(data.from) })
            : t('timeline.owner_changed', { to: person(data.to) }),
        detail: null,
      };
    case 'next_action_set': {
      const due = text(data.due);
      return {
        title:
          due === undefined
            ? t('timeline.next_action_set')
            : t('timeline.next_action_due', { date: formatDay(due) }),
        detail: body,
      };
    }
    case 'joined': {
      const chat = text(data.chat);
      return {
        title: chat === undefined ? t('timeline.joined') : t('timeline.joined_chat', { chat }),
        detail: null,
      };
    }
    case 'left': {
      const on = text(data.on);
      return {
        title:
          on === undefined ? t('timeline.left') : t('timeline.left_on', { date: formatDay(on) }),
        detail: null,
      };
    }
    case 'reported':
      return { title: t('timeline.reported', { source: source(data.source) }), detail: null };
    case 'imported':
      return { title: t('timeline.imported', { source: source(data.source) }), detail: null };
    case 'merged':
      return {
        title:
          text(data.into) === undefined ? t('timeline.merged_from') : t('timeline.merged_into'),
        detail: null,
      };
    case 'profile_updated':
      return { title: t('timeline.profile_updated'), detail: null };
    case 'form_submitted':
      return { title: t('timeline.form_submitted'), detail: null };
    default:
      return { title: t('timeline.unknown'), detail: body };
  }
};
