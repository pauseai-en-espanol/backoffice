import type { getTranslator } from '@backoffice/i18n/messages';

import { onboardingErrors } from '../text';

type Translator = ReturnType<typeof getTranslator>;

/**
 * Every word Mensajes hands its client components, built once by the server page. Those that show a placeholder as
 * written ("{nombre}") are raw, never formatted; those with values of their own keep their `{name}` placeholders, which
 * the components fill (fill.ts).
 */
export const messagesPageText = (t: Translator) => {
  const raw = (key: Parameters<Translator['raw']>[0]) => String(t.raw(key));
  return {
    titleLabel: t('messageTemplates.titleLabel'),
    titleHint: t('messageTemplates.titleHint'),
    titleMissing: t('messageTemplates.titleMissing'),
    bodyMissing: t('messageTemplates.bodyMissing'),
    body: t('messageTemplates.body'),
    bodyNameless: t('messageTemplates.bodyNameless'),
    bodyNamelessHint: t('messageTemplates.bodyNamelessHint'),
    /** One's own (PLAN R71): its mark, and what a new one is for someone who isn't an admin. */
    ownMark: t('messageTemplates.ownMark'),
    ownHint: t('messageTemplates.ownHint'),
    /** The team's, to someone who can't change it. */
    teamReadOnly: t('messageTemplates.teamReadOnly'),
    /** An admin's choice for a new one: the team's, or their own. */
    whose: {
      legend: t('messageTemplates.whose.legend'),
      team: t('messageTemplates.whose.team'),
      teamHint: t('messageTemplates.whose.teamHint'),
      mine: t('messageTemplates.whose.mine'),
      mineHint: t('messageTemplates.whose.mineHint'),
    },
    /** "Escribir un mensaje de {purpose}" */
    addFor: raw('messageTemplates.addFor'),
    add: t('messageTemplates.add'),
    edit: t('messageTemplates.edit'),
    /** "Editar «{title}»" */
    editFor: raw('messageTemplates.editFor'),
    save: t('messageTemplates.save'),
    cancel: t('person.cancel'),
    added: t('messageTemplates.added'),
    saved: t('messageTemplates.saved'),
    retire: t('messageTemplates.retire'),
    retireFor: raw('messageTemplates.retireFor'),
    retireQuestion: raw('messageTemplates.retireQuestion'),
    retired: t('messageTemplates.retired'),
    restore: t('messageTemplates.restore'),
    restoreFor: raw('messageTemplates.restoreFor'),
    restored: t('messageTemplates.restored'),
    preview: t('messageTemplates.preview'),
    /** "A {name}" */
    previewNamed: raw('messageTemplates.previewNamed'),
    previewNameless: t('messageTemplates.previewNameless'),
    exampleName: t('messageTemplates.exampleName'),
    exampleLink: t('messageTemplates.exampleLink'),
    problems: t('messageTemplates.problems'),
    problem: {
      unknown: raw('messageTemplates.problem.unknown'),
      brace: raw('messageTemplates.problem.brace'),
      needsLink: raw('messageTemplates.problem.needsLink'),
      needsNameless: raw('messageTemplates.problem.needsNameless'),
      namelessNames: raw('messageTemplates.problem.namelessNames'),
      namelessUnneeded: raw('messageTemplates.problem.namelessUnneeded'),
    },
    purposes: {
      welcome: t('messageTemplates.purposes.welcome'),
      census_link: t('messageTemplates.purposes.census_link'),
    },
    /** Where each purpose's message is offered, and its placeholders as written. */
    purposeHints: {
      welcome: raw('messageTemplates.purposeHints.welcome'),
      census_link: raw('messageTemplates.purposeHints.census_link'),
    },
    errors: { ...onboardingErrors(t), taken: t('messageTemplates.titleTaken') },
  };
};

export type MessagesPageText = ReturnType<typeof messagesPageText>;
