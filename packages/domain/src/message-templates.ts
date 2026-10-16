/**
 * The messages newcomers receive by WhatsApp, written by the team in Mensajes (PLAN M5): the welcome and the census
 * link's. These are the database's rules (migration message_templates) said again for the staff app, which shows a
 * problem as it's typed, and the filling in, shared by the staff app (the welcome) and the API (the census link's,
 * whose URL only it sees). Nothing here sends anything.
 */

export const MESSAGE_PURPOSES = ['welcome', 'census_link'] as const;
export type MessagePurpose = (typeof MESSAGE_PURPOSES)[number];

/** Each purpose's placeholders, without their braces. */
export const PLACEHOLDERS: Readonly<Record<MessagePurpose, readonly string[]>> = {
  welcome: ['nombre', 'yo'],
  census_link: ['nombre', 'yo', 'enlace'],
};

export type TemplateProblem =
  /** A placeholder this purpose doesn't have, as written ("{name}"). */
  | { kind: 'unknown'; placeholder: string }
  /** A brace that opens or closes no placeholder. */
  | { kind: 'brace' }
  /** A census link's message (either version) without {enlace}. */
  | { kind: 'needsLink' }
  /** The message uses {nombre} but doesn't say how it reads without a name. */
  | { kind: 'needsNameless' }
  /** The version without a name names someone. */
  | { kind: 'namelessNames' }
  /** A version without a name for a message that names nobody. */
  | { kind: 'namelessUnneeded' };

const TOKEN = /\{[^{}\n]*\}/gu;

const blank = (text: string | null | undefined): boolean => (text ?? '').trim() === '';

/** What the database would refuse in a message, first to last; none when it may be saved. */
export const templateProblems = (
  purpose: MessagePurpose,
  body: string,
  bodyNameless: string | null | undefined,
): TemplateProblem[] => {
  const problems: TemplateProblem[] = [];
  const allowed = PLACEHOLDERS[purpose];
  const texts = blank(bodyNameless) ? [body] : [body, bodyNameless ?? ''];
  const unknown = new Set<string>();
  let stray = false;
  for (const text of texts) {
    for (const token of text.match(TOKEN) ?? []) {
      if (!allowed.includes(token.slice(1, -1))) {
        unknown.add(token);
      }
    }
    stray ||= /[{}]/u.test(text.replace(TOKEN, ''));
  }
  problems.push(...[...unknown].map((placeholder) => ({ kind: 'unknown' as const, placeholder })));
  if (stray) {
    problems.push({ kind: 'brace' });
  }
  if (purpose === 'census_link' && texts.some((text) => !text.includes('{enlace}'))) {
    problems.push({ kind: 'needsLink' });
  }
  if (body.includes('{nombre}')) {
    if (blank(bodyNameless)) {
      problems.push({ kind: 'needsNameless' });
    } else if (bodyNameless?.includes('{nombre}')) {
      problems.push({ kind: 'namelessNames' });
    }
  } else if (!blank(bodyNameless)) {
    problems.push({ kind: 'namelessUnneeded' });
  }
  return problems;
};

/**
 * A first draft of the version without a name, for the team to adjust: {nombre} taken out with the comma or space
 * before it ("Hola, {nombre}:" reads "Hola:").
 */
export const namelessDraft = (body: string): string =>
  body
    .replace(/,?[ \t]*\{nombre\}/gu, '')
    .replace(/^[\s,]+/u, '')
    .trim();

export interface MessageValues {
  /** The name to greet them by; none for someone saved without one (PLAN R37). */
  nombre?: string | undefined;
  /** Who writes: the staff member's display name. */
  yo: string;
  /** The census link's URL. */
  enlace?: string | undefined;
}

/** The message as it goes out: the version for someone without a name when they have none, its placeholders filled. */
export const fillMessage = (
  template: { body: string; bodyNameless: string | null },
  values: MessageValues,
): string => {
  const named = !blank(values.nombre);
  const text = named || template.bodyNameless === null ? template.body : template.bodyNameless;
  const filled: Readonly<Record<string, string | undefined>> = {
    nombre: values.nombre?.trim(),
    yo: values.yo,
    enlace: values.enlace,
  };
  return text.replace(TOKEN, (token) => filled[token.slice(1, -1)] ?? token);
};
