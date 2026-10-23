import { describe, expect, it } from 'vitest';

import { mailtoLink } from './mailto.js';

describe('mailtoLink (PLAN R77)', () => {
  it('opens the mail app with the subject and the message written', () => {
    expect(
      mailtoLink('ana@ejemplo.test', { subject: 'Hola', body: 'Hola, Ana: ¿hablamos?\nUn abrazo' }),
    ).toBe(
      'mailto:ana@ejemplo.test?subject=Hola&body=Hola%2C%20Ana%3A%20%C2%BFhablamos%3F%0AUn%20abrazo',
    );
    expect(mailtoLink(' ana@ejemplo.test ', {})).toBe('mailto:ana@ejemplo.test');
  });

  it('is nothing for what isn’t an address, so no other header can be slipped in', () => {
    expect(mailtoLink('no-es-correo', { body: 'Hola' })).toBeUndefined();
    expect(mailtoLink('ana@ejemplo.test?bcc=otra@ejemplo.test', { body: 'Hola' })).toBeUndefined();
    expect(mailtoLink('ana@ejemplo.test&cc=x@ejemplo.test', {})).toBeUndefined();
  });
});
