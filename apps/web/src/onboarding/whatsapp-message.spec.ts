import { getTranslator } from '@backoffice/i18n/messages';
import { describe, expect, it } from 'vitest';

import type { Identity } from './types';

import { greetingName, handoverLink, whatsappMessage } from './whatsapp-message';

const t = getTranslator();

const phone = (value: string, verified = false): Identity => ({
  id: value,
  kind: 'phone',
  value,
  verified,
  source: 'manual',
});

describe('the WhatsApp handover', () => {
  it('greets the person by their preferred name, else their first name', () => {
    expect(greetingName({ preferredName: 'Pepa', fullName: 'Josefa García' })).toBe('Pepa');
    expect(greetingName({ preferredName: null, fullName: '  María José Núñez ' })).toBe('María');
    expect(greetingName({ preferredName: null, fullName: null })).toBeUndefined();
  });

  it('greets someone without a name without one (PLAN R37)', () => {
    expect(whatsappMessage(String(t.raw('person.whatsappMessageNameless')), { me: 'Luis' })).toBe(
      'Hola: soy Luis, de PauseAI España. Te escribo para darte la bienvenida y contarte cómo puedes participar. ¿Te viene bien que hablemos?',
    );
  });

  it('prepares the message with both names', () => {
    expect(
      whatsappMessage(String(t.raw('person.whatsappMessage')), { name: 'Ana', me: 'Luis' }),
    ).toBe(
      'Hola, Ana: soy Luis, de PauseAI España. Te escribo para darte la bienvenida y contarte cómo puedes participar. ¿Te viene bien que hablemos?',
    );
  });

  it("writes to the person's checked phone first, with the message ready", () => {
    expect(
      handoverLink(
        { identities: [phone('+34600000001'), phone('+34600000002', true)], whatsapp: null },
        'Hola',
      ),
    ).toBe('https://wa.me/34600000002?text=Hola');
  });

  it("falls back to the API's handover, adding the message when it has none", () => {
    expect(handoverLink({ identities: [], whatsapp: 'https://wa.me/34600000003' }, 'Hola')).toBe(
      'https://wa.me/34600000003?text=Hola',
    );
    expect(handoverLink({ identities: [], whatsapp: '+34600000004' }, 'Hola')).toBe(
      'https://wa.me/34600000004?text=Hola',
    );
  });

  it('gives nothing without a number, or with a link elsewhere', () => {
    expect(handoverLink({ identities: [], whatsapp: null }, 'Hola')).toBeUndefined();
    expect(
      handoverLink({ identities: [], whatsapp: 'https://malo.example/34600000005' }, 'Hola'),
    ).toBeUndefined();
  });
});
