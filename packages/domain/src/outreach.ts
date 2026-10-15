/**
 * Outreach letters (outreach spec §3), ported from the `outreach` repo's CLI so its rules carry over: a merge field
 * that doesn't resolve fails the letter rather than leaving a blank, nobody's gender is guessed from their name, a
 * dash a person wouldn't type fails it too, and nothing here sends anything. The letter is text for a person to read,
 * adjust and send; `mailtoLink` only opens their own mail client with it.
 */

export type Tier = 'A' | 'B';
export type Treatment = 'neutral' | 'masculino' | 'femenino';

/** Who a letter is addressed to: a person at an organisation, or the organisation's own inbox (no person). */
export interface Addressee {
  /** How the organisation reads in a listing: "Sindicato Ejemplo — Aragón". */
  orgDisplay: string;
  territory?: string | null;
  personName?: string | null;
  /** The name to greet them by, when the full name won't do; never derived. */
  greetingName?: string | null;
  /** Set only when someone has checked; neutral otherwise. */
  treatment?: Treatment;
}

const DISPLAY_SEPARATOR = ' — ';

/**
 * A listing's "ORG — qualifier" reads badly inside a sentence: a place takes "en", anything else (a workplace, a
 * section, a secretariat) a comma.
 */
export const readableOrg = (orgDisplay: string, territory?: string | null): string => {
  const at = orgDisplay.indexOf(DISPLAY_SEPARATOR);
  if (at === -1) {
    return orgDisplay;
  }
  const org = orgDisplay.slice(0, at);
  const qualifier = orgDisplay.slice(at + DISPLAY_SEPARATOR.length);
  return qualifier === territory ? `${org} en ${qualifier}` : `${org}, ${qualifier}`;
};

/**
 * The Spanish greeting. "Estimado/a" whenever we don't positively know how someone is addressed: guessing from a
 * first name would misgender real people in a cold email. An inbox gets "compañeras y compañeros", the ordinary
 * register of union correspondence.
 */
export const salutation = (addressee: Addressee): string => {
  const person = addressee.personName?.trim();
  if (!person) {
    return `Estimadas compañeras y compañeros de ${readableOrg(addressee.orgDisplay, addressee.territory)}:`;
  }
  const name = addressee.greetingName?.trim() || person;
  switch (addressee.treatment) {
    case 'masculino': {
      return `Estimado ${name}:`;
    }
    case 'femenino': {
      return `Estimada ${name}:`;
    }
    default: {
      return `Estimado/a ${name}:`;
    }
  }
};

/** The fields a template may use. */
export const MERGE_FIELDS = [
  'saludo',
  'anchor',
  'org',
  'orgDisplay',
  'territory',
  'sector',
  'role',
  'firma',
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

const FIELD = /\{\{\s*([\w.]+)\s*\}\}/gu;

/** The fields a text uses, once each, in order. */
export const fieldsIn = (text: string): string[] => [
  ...new Set([...text.matchAll(FIELD)].map((match) => match[1] ?? '')),
];

/**
 * Fills in `{{field}}`s. An unknown or empty field is reported, and left as it was, rather than rendered as a blank:
 * a half-merged email is worse than none.
 */
export const merge = (
  text: string,
  fields: Readonly<Partial<Record<string, string | null>>>,
): { output: string; missing: string[] } => {
  const missing = new Set<string>();
  const output = text.replaceAll(FIELD, (whole, key: string) => {
    const value = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (value === undefined || value === null || value.trim() === '') {
      missing.add(key);
      return whole;
    }
    return value;
  });
  return { output, missing: [...missing] };
};

export const countWords = (text: string): number => text.split(/\s+/u).filter(Boolean).length;

export interface ProseIssue {
  /** `emDash` and `enDash` fail a letter; a `phrase` only warns. */
  rule: 'emDash' | 'enDash' | 'phrase';
  found: string;
  /** The words around it, on one line. */
  context: string;
  fatal: boolean;
}

/**
 * The campaign's own letters, written by hand, use no em or en dashes: they punctuate with commas, colons and
 * semicolons. A dash is the mark of a compressed sentence, and a reader who notices reads the whole email as
 * machine-written.
 */
const DASHES: readonly [RegExp, ProseIssue['rule']][] = [
  [/—/gu, 'emDash'],
  [/–/gu, 'enDash'],
];

/** Openers and connectives that read as filler in Spanish correspondence: rare in the letters, common in generated
 * prose. Deliberately short; not a style guide. */
const PHRASES: readonly RegExp[] = [
  /\bcabe (?:señalar|destacar|mencionar|resaltar)\b/giu,
  /\bes importante (?:señalar|destacar|recordar|mencionar)\b/giu,
  /\ben (?:definitiva|resumen|conclusión)\b/giu,
  /\bno duden? en (?:ponerse|contactar|escribir)/giu,
  /\bun mundo (?:cada vez más|en constante)/giu,
  /\bpanorama (?:actual|cambiante)\b/giu,
  /\bha llegado para quedarse\b/giu,
  /\bde la mano de la (?:tecnología|innovación)\b/giu,
  /\bsin lugar a dudas\b/giu,
  /\bplantea (?:importantes|numerosos|múltiples)\b/giu,
  /\bel presente (?:correo|escrito|documento)\b/giu,
  /\bquedamos a su (?:entera )?disposición\b/giu,
  /\bnos complace\b/giu,
  /\besperamos su pronta respuesta\b/giu,
];

const CONTEXT = 45;

/** Checks the text that reaches the recipient: the merged letter, since a dash arrives through an anchor or an
 * organisation's name as easily as through the template. */
export const checkProse = (text: string): ProseIssue[] => {
  const issues: ProseIssue[] = [];
  const scan = (pattern: RegExp, rule: ProseIssue['rule'], fatal: boolean): void => {
    for (const match of text.matchAll(pattern)) {
      const at = match.index;
      const found = match[0];
      issues.push({
        rule,
        found,
        context: text
          .slice(Math.max(0, at - CONTEXT), at + found.length + CONTEXT)
          .replaceAll(/\s+/gu, ' ')
          .trim(),
        fatal,
      });
    }
  };
  for (const [pattern, rule] of DASHES) {
    scan(pattern, rule, true);
  }
  for (const pattern of PHRASES) {
    scan(pattern, 'phrase', false);
  }
  return issues;
};

/** Targets without a priority go last: most of a list is not urgent, and marking everything urgent marks nothing. */
export const NO_PRIORITY = Number.MAX_SAFE_INTEGER;

/** The order targets go out in: priority, then tier A before B, then a stable tie-break. */
export const bySendOrder = (
  a: { priority?: number | null; tier: Tier; id: string },
  b: { priority?: number | null; tier: Tier; id: string },
): number =>
  (a.priority ?? NO_PRIORITY) - (b.priority ?? NO_PRIORITY) ||
  a.tier.localeCompare(b.tier) ||
  a.id.localeCompare(b.id);

export interface LetterTemplate {
  subject: string;
  body: string;
  maxWords?: number | null;
  /** The sources of the claims the template itself makes. */
  sources: readonly string[];
}

export interface LetterContact extends Addressee {
  /** The organisation's short name, `{{org}}`. */
  org: string;
  sector?: string | null;
  role?: string | null;
  /** The key of the evidence paragraph for them, `{{anchor}}`. */
  anchor?: string | null;
  needsReview: boolean;
  hold: boolean;
}

export interface LetterAnchor {
  text: string;
  sources: readonly string[];
}

/** Why a letter can't be written. */
export type LetterProblem =
  | { kind: 'needsReview' }
  | { kind: 'held' }
  | { kind: 'unknownAnchor'; anchor: string }
  | { kind: 'unresolved'; fields: string[] }
  | { kind: 'prose'; issue: ProseIssue };

/** What a person should look at before sending. */
export type LetterWarning =
  { kind: 'prose'; issue: ProseIssue } | { kind: 'long'; words: number; maxWords: number };

export type Letter =
  | {
      ok: true;
      subject: string;
      body: string;
      words: number;
      /** The template's sources, then the anchor's when the letter uses it: for the sender to check the claims. */
      sources: string[];
      warnings: LetterWarning[];
    }
  | { ok: false; problems: LetterProblem[] };

/** Writes one letter (outreach spec §3), or says every reason it can't. */
export const renderLetter = ({
  template,
  contact,
  anchors,
  signature,
}: {
  template: LetterTemplate;
  contact: LetterContact;
  anchors: Readonly<Record<string, LetterAnchor>>;
  signature: string;
}): Letter => {
  const problems: LetterProblem[] = [];
  if (contact.needsReview) {
    problems.push({ kind: 'needsReview' });
  }
  if (contact.hold) {
    problems.push({ kind: 'held' });
  }
  const anchor =
    contact.anchor && Object.hasOwn(anchors, contact.anchor) ? anchors[contact.anchor] : undefined;
  if (contact.anchor && !anchor) {
    problems.push({ kind: 'unknownAnchor', anchor: contact.anchor });
  }
  const fields: Record<MergeField, string | null | undefined> = {
    saludo: salutation(contact),
    anchor: anchor?.text,
    org: contact.org,
    orgDisplay: contact.orgDisplay,
    territory: contact.territory,
    sector: contact.sector,
    role: contact.role,
    firma: signature,
  };
  const subject = merge(template.subject, fields);
  const body = merge(template.body, fields);
  const unresolved = [...new Set([...subject.missing, ...body.missing])].filter(
    (field) => field !== 'anchor' || !contact.anchor || anchor,
  );
  if (unresolved.length > 0) {
    problems.push({ kind: 'unresolved', fields: unresolved });
  }
  const warnings: LetterWarning[] = [];
  for (const issue of [...checkProse(subject.output), ...checkProse(body.output)]) {
    if (issue.fatal) {
      problems.push({ kind: 'prose', issue });
    } else {
      warnings.push({ kind: 'prose', issue });
    }
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  const words = countWords(body.output);
  if (template.maxWords && words > template.maxWords) {
    warnings.push({ kind: 'long', words, maxWords: template.maxWords });
  }
  const usesAnchor = fieldsIn(template.body).includes('anchor');
  return {
    ok: true,
    subject: subject.output,
    body: body.output,
    words,
    sources: [...new Set([...template.sources, ...(usesAnchor && anchor ? anchor.sources : [])])],
    warnings,
  };
};

/** An address in a `mailto:` link: escaped, but readable. */
const mailtoAddress = (address: string): string =>
  encodeURIComponent(address.trim()).replaceAll('%40', '@');

/**
 * A `mailto:` link (RFC 6068) that opens the sender's own mail client with the letter filled in, for them to read and
 * send: line breaks as CRLF, everything escaped. Some clients cut long links, so the page offers copy buttons too.
 */
export const mailtoLink = ({
  to,
  cc = [],
  subject,
  body,
}: {
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  body: string;
}): string => {
  const query = [
    ...(cc.length > 0 ? [`cc=${cc.map(mailtoAddress).join(',')}`] : []),
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body.replaceAll(/\r?\n/gu, '\r\n'))}`,
  ];
  return `mailto:${to.map(mailtoAddress).join(',')}?${query.join('&')}`;
};
