import { describe, expect, it } from 'vitest';

import { whatsappLink } from './whatsapp.js';

describe('whatsappLink', () => {
  it('opens a chat with the number, the message ready', () => {
    expect(whatsappLink('+34612345678', 'Hola, Ana: ¿hablamos?')).toBe(
      'https://wa.me/34612345678?text=Hola%2C%20Ana%3A%20%C2%BFhablamos%3F',
    );
    expect(whatsappLink('+34612345678')).toBe('https://wa.me/34612345678');
  });

  it('refuses a number that is not E.164', () => {
    expect(whatsappLink('612345678')).toBeUndefined();
    expect(whatsappLink('+34 612 345 678')).toBeUndefined();
  });
});
