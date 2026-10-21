import { getTranslator } from '@backoffice/i18n/messages';
import { describe, expect, it } from 'vitest';

import { describeEvent } from './timeline';

const t = getTranslator();
const ANA = '0190f8c4-0000-7000-8000-000000000103';
const staffName = (id: string) => (id === ANA ? 'Ana Ejemplo' : undefined);

const describe_ = (kind: string, data: Record<string, unknown> = {}, body: string | null = null) =>
  describeEvent({ kind, data, body }, { t, staffName });

describe('timeline events in words', () => {
  it('name both stages of a stage change', () => {
    expect(describe_('stage_changed', { from: 'new', to: 'contacting' }).title).toBe(
      'Etapa: de «Nuevo» a «En contacto»',
    );
  });

  it('keep the old names of the stages PLAN M5 folded, and say when the fold moved someone', () => {
    expect(describe_('stage_changed', { from: 'new', to: 'talking' }).title).toBe(
      'Etapa: de «Nuevo» a «En conversación»',
    );
    expect(describe_('created', { stage: 'to_triage' }).title).toBe(
      'Ficha creada en «Por clasificar»',
    );
    expect(
      describe_('stage_changed', { from: 'talking', to: 'contacting', stages_folded: true }),
    ).toEqual({
      title: 'Etapa: de «En conversación» a «En contacto»',
      detail: 'al simplificar las etapas',
    });
  });

  it('name the message a contact attempt sent, when it was written in Mensajes (PLAN M5)', () => {
    const data = {
      channel: 'whatsapp',
      outcome: 'left_message',
      templateId: '0190f8c4-0000-7000-8000-0000000004e1',
      templateVersion: 2,
    };
    expect(
      describeEvent(
        { kind: 'contact_attempt', data, body: null },
        { t, staffName, templateTitle: () => 'Bienvenida corta' },
      ).title,
    ).toBe(
      'Intento de contacto por WhatsApp: Mensaje dejado, con el mensaje «Bienvenida corta» (versión 2)',
    );
    expect(describe_('contact_attempt', data).title).toBe(
      'Intento de contacto por WhatsApp: Mensaje dejado, con un mensaje de Mensajes (versión 2)',
    );
    // Someone else's own, which the reader can't see (PLAN R71).
    expect(
      describeEvent(
        { kind: 'contact_attempt', data, body: null },
        { t, staffName, templateTitle: () => null },
      ).title,
    ).toBe(
      'Intento de contacto por WhatsApp: Mensaje dejado, con un mensaje propio de quien lo envió (versión 2)',
    );
  });

  it('say contact attempts with their channel and outcome, and keep the note', () => {
    expect(
      describe_('contact_attempt', { channel: 'whatsapp', outcome: 'left_message' }, 'Le escribí'),
    ).toEqual({
      title: 'Intento de contacto por WhatsApp: Mensaje dejado',
      detail: 'Le escribí',
    });
  });

  it('name owners from the team list, and say when nobody owns the person any more', () => {
    expect(describe_('owner_changed', { from: null, to: ANA }).title).toBe(
      'Responsable: Ana Ejemplo',
    );
    expect(describe_('owner_changed', { from: ANA, to: null }).title).toBe(
      'Ya no tiene responsable (antes: Ana Ejemplo)',
    );
    expect(describe_('owner_changed', { to: 'otro-id' }).title).toBe('Responsable: alguien');
  });

  it('give the next action its due date, and the text as detail', () => {
    expect(describe_('next_action_set', { due: '2026-10-20' }, 'Llamar')).toEqual({
      title: 'Siguiente paso, para el 20 de octubre de 2026',
      detail: 'Llamar',
    });
  });

  it('say joins, leaves, sources and merges', () => {
    expect(describe_('joined', { chat: 'Madrid' }).title).toBe('Entró en la comunidad (Madrid)');
    expect(describe_('left', { on: '2026-10-15' }).title).toBe(
      'Salió de la comunidad el 15 de octubre de 2026',
    );
    expect(describe_('imported', { source: 'airtable' }).title).toBe(
      'Añadido desde Formulario de PauseAI Global',
    );
    expect(describe_('reported', { source: 'telegram' }).title).toBe(
      'Se avisó de su alta (Bot de Telegram)',
    );
    expect(describe_('merged', { into: 'x' }).title).toBe('Esta ficha se fusionó en otra');
    expect(describe_('merged', { from: 'x' }).title).toBe('Se fusionó aquí otra ficha');
  });

  it('still says something for a kind it does not know', () => {
    expect(describe_('algo_nuevo', {}, 'texto')).toEqual({ title: 'Cambio', detail: 'texto' });
  });
});
