import { fieldsIn, MERGE_FIELDS } from '@backoffice/domain/outreach';

import { fill } from '@/fill';

import {
  type ContactSummary,
  type LetterProblem,
  type LetterWarning,
  type ProseIssue,
  TARGET_STATUSES,
  type TargetStatus,
  type Tier,
} from './types';

/**
 * The outreach pages' words and orders, pure, for the server pages and their client components alike (no message
 * formatter): a campaign's board by status, where each target stands in the queue, a letter's problems and warnings in
 * words, and which of the outreach repo's files is which.
 */

/** A campaign's targets by status, in the board's order of statuses, each group still in send order. */
export const groupByStatus = <T extends { status: TargetStatus }>(
  targets: readonly T[],
): { status: TargetStatus; targets: T[] }[] =>
  TARGET_STATUSES.map((status) => ({
    status,
    targets: targets.filter((target) => target.status === status),
  })).filter((group) => group.targets.length > 0);

/** The statuses that still wait to go out: the queue Siguiente serves. */
export const QUEUED: readonly TargetStatus[] = ['pending', 'ready'];

/** Where each target still to send stands in the queue, from 1, in the order given (the API's send order). */
export const queuePositions = (
  targets: readonly { id: string; status: TargetStatus }[],
): Map<string, number> => {
  const positions = new Map<string, number>();
  for (const target of targets) {
    if (QUEUED.includes(target.status)) {
      positions.set(target.id, positions.size + 1);
    }
  }
  return positions;
};

/** "Prioridad 1", or "Sin prioridad": none sorts last. */
export const priorityLabel = (
  priority: number | null,
  words: { priority: string; none: string },
): string =>
  priority === null ? words.none : fill(words.priority, { priority: String(priority) });

/** A campaign's counts by target status, in the board's order, without the empty ones; and how many in all. */
export const countsByStatus = (
  counts: Readonly<Partial<Record<TargetStatus, number>>>,
): { rows: [TargetStatus, number][]; total: number } => {
  const rows = TARGET_STATUSES.flatMap((status): [TargetStatus, number][] => {
    const count = counts[status] ?? 0;
    return count > 0 ? [[status, count]] : [];
  });
  return { rows, total: rows.reduce((sum, [, count]) => sum + count, 0) };
};

/** Who a contact is, in a line: the person, or the organisation's own inbox. */
export const contactName = (
  contact: Pick<ContactSummary, 'personName' | 'orgDisplay' | 'anonymised'>,
  words: { inbox: string; anonymised: string },
): string =>
  contact.personName?.trim() ||
  (contact.anonymised ? words.anonymised : fill(words.inbox, { org: contact.orgDisplay }));

/** Where a problem is put right: the contact's page, or a part of the campaign's. */
export type Fix = 'contact' | 'campaign' | 'templates' | 'anchors';

/** The words a letter's problems and warnings take: templates keep their `{name}` placeholders. */
export interface LetterWords {
  needsReview: string;
  held: string;
  /** "… el nivel {tier}." */
  noTemplate: string;
  /** "… «{anchor}» …" */
  unknownAnchor: string;
  /** "Faltan datos para: {fields}." */
  unresolved: string;
  /** "… «{context}» …" */
  emDash: string;
  enDash: string;
  /** "Frase de relleno «{found}» en «{context}»." */
  phrase: string;
  /** "{words} palabras; el límite es {maxWords}." */
  long: string;
  unknownProblem: string;
  unknownWarning: string;
  /** Each merge field in words. */
  fields: Readonly<Record<string, string>>;
}

/** Merge fields filled from the contact's own data: a gap in one is fixed on their page. */
const CONTACT_FIELDS: ReadonlySet<string> = new Set([
  'saludo',
  'org',
  'orgDisplay',
  'territory',
  'sector',
  'role',
]);

/** Merge fields in words, "el cargo ({{role}})"; one that isn't a merge field, as the template wrote it. */
export const fieldNames = (fields: readonly string[], names: Readonly<Record<string, string>>) =>
  fields
    .map((field) =>
      names[field] === undefined ? `{{${field}}}` : `${names[field]} ({{${field}}})`,
    )
    .join(', ');

const proseText = (issue: ProseIssue, words: LetterWords): string =>
  fill(words[issue.rule], { found: issue.found, context: issue.context });

/** A problem in words, and where to put it right. */
export const problemText = (
  problem: LetterProblem,
  words: LetterWords,
): { text: string; fixes: Fix[] } => {
  switch (problem.kind) {
    case 'needsReview':
      return { text: words.needsReview, fixes: ['contact'] };
    case 'held':
      return { text: words.held, fixes: ['contact'] };
    case 'noTemplate':
      return { text: fill(words.noTemplate, { tier: problem.tier }), fixes: ['templates'] };
    case 'unknownAnchor':
      return {
        text: fill(words.unknownAnchor, { anchor: problem.anchor }),
        fixes: ['anchors', 'contact'],
      };
    case 'unresolved': {
      const fixes = new Set<Fix>();
      for (const field of problem.fields) {
        fixes.add(
          CONTACT_FIELDS.has(field)
            ? 'contact'
            : field === 'firma'
              ? 'campaign'
              : field === 'anchor'
                ? 'anchors'
                : 'templates',
        );
      }
      return {
        text: fill(words.unresolved, { fields: fieldNames(problem.fields, words.fields) }),
        fixes: [...fixes],
      };
    }
    case 'prose':
      return { text: proseText(problem.issue, words), fixes: ['templates'] };
    default:
      return { text: words.unknownProblem, fixes: [] };
  }
};

/** A warning in words. */
export const warningText = (warning: LetterWarning, words: LetterWords): string => {
  switch (warning.kind) {
    case 'prose':
      return proseText(warning.issue, words);
    case 'long':
      return fill(words.long, {
        words: String(warning.words),
        maxWords: String(warning.maxWords),
      });
    default:
      return words.unknownWarning;
  }
};

/** The fields a template uses that aren't merge fields: each makes every letter fail (outreach spec §3). */
export const unknownMergeFields = (...texts: readonly string[]): string[] => [
  ...new Set(
    texts.flatMap(fieldsIn).filter((field) => !(MERGE_FIELDS as readonly string[]).includes(field)),
  ),
];

/** The outreach repo's files a campaign is imported from (outreach spec §4), by what each holds. */
export const IMPORT_FILE_KINDS = ['campaign', 'contacts', 'anchors', 'A', 'B', 'tracking'] as const;
export type ImportFileKind = (typeof IMPORT_FILE_KINDS)[number];

/** The files without which there is no campaign to import. */
export const REQUIRED_FILES: readonly ImportFileKind[] = ['campaign', 'contacts'];

/** The files' text, all together, the API takes at most (staff-api M3). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const FILE_NAMES: Readonly<Record<string, ImportFileKind>> = {
  'campaign.yaml': 'campaign',
  'campaign.yml': 'campaign',
  'contacts.yaml': 'contacts',
  'contacts.yml': 'contacts',
  'anchors.yaml': 'anchors',
  'anchors.yml': 'anchors',
  'tier-a.md': 'A',
  'tier-b.md': 'B',
  'tracking.csv': 'tracking',
};

/** Which file this is, by its name alone (any folder, any case); undefined for one the importer doesn't take. */
export const recogniseFile = (name: string): ImportFileKind | undefined =>
  FILE_NAMES[(name.split(/[\\/]/u).pop() ?? '').trim().toLowerCase()];

/** What `POST /api/outreach/import` takes as `files`. */
export interface ImportFiles {
  campaign: string;
  contacts: string;
  anchors?: string;
  templates: { A?: string; B?: string };
  tracking?: string;
}

/** The request's files from the texts read, or the required ones missing. */
export const importFiles = (
  texts: Readonly<Partial<Record<ImportFileKind, string>>>,
): { files: ImportFiles } | { missing: ImportFileKind[] } => {
  const { campaign, contacts, anchors, A, B, tracking } = texts;
  if (campaign === undefined || contacts === undefined) {
    return { missing: REQUIRED_FILES.filter((kind) => texts[kind] === undefined) };
  }
  return {
    files: {
      campaign,
      contacts,
      ...(anchors === undefined ? {} : { anchors }),
      templates: { ...(A === undefined ? {} : { A }), ...(B === undefined ? {} : { B }) },
      ...(tracking === undefined ? {} : { tracking }),
    },
  };
};

/** The tier a template is for, in the order the page shows them. */
export const TEMPLATE_TIERS: readonly Tier[] = ['A', 'B'];
