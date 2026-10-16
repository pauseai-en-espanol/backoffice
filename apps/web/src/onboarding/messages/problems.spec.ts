import { getTranslator } from '@backoffice/i18n/messages';
import { describe, expect, it } from 'vitest';

import { problemText } from './problems';
import { messagesPageText } from './text';

const text = messagesPageText(getTranslator()).problem;

describe('what a message needs, in words (Mensajes, PLAN M5)', () => {
  it('names the unknown placeholder and lists the purpose’s own, braces and all', () => {
    expect(problemText({ kind: 'unknown', placeholder: '{name}' }, 'welcome', text)).toBe(
      '{name} no es un hueco de este mensaje: los suyos son {nombre}, {yo}.',
    );
    expect(problemText({ kind: 'unknown', placeholder: '{url}' }, 'census_link', text)).toBe(
      '{url} no es un hueco de este mensaje: los suyos son {nombre}, {yo}, {enlace}.',
    );
  });

  it('shows the placeholders it mentions as written, never formatted away', () => {
    expect(problemText({ kind: 'needsLink' }, 'census_link', text)).toContain('{enlace}');
    expect(problemText({ kind: 'brace' }, 'welcome', text)).toContain('«{» o «}»');
  });
});
