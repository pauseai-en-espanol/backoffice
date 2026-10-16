import {
  type MessagePurpose,
  PLACEHOLDERS,
  type TemplateProblem,
} from '@backoffice/domain/message-templates';

import { fill } from '@/fill';

import type { MessagesPageText } from './text';

/** A problem in words, its placeholder named and the purpose's own listed. */
export const problemText = (
  problem: TemplateProblem,
  purpose: MessagePurpose,
  text: MessagesPageText['problem'],
): string =>
  problem.kind === 'unknown'
    ? fill(text.unknown, {
        placeholder: problem.placeholder,
        allowed: PLACEHOLDERS[purpose].map((name) => `{${name}}`).join(', '),
      })
    : text[problem.kind];
