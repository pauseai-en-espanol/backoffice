import { getTranslator } from '@backoffice/i18n/messages';
import { describe, expect, it } from 'vitest';

import { describeContactEvent } from './timeline';

const t = getTranslator();
const names: Readonly<Record<string, string>> = { u1: 'Ana Ejemplo' };
const campaigns: Readonly<Record<string, string>> = { c1: 'Carta de ejemplo' };
const describe_ = (
  kind: string,
  data: Record<string, unknown> = {},
  { body = null, campaignId = null }: { body?: string | null; campaignId?: string | null } = {},
) =>
  describeContactEvent(
    { kind, data, body, campaignId },
    {
      t,
      staffName: (id) => names[id],
      campaignName: (id) => campaigns[id],
    },
  );

describe('the outreach timeline in words', () => {
  it('says every kind the database writes', () => {
    expect(describe_('created', { stage: 'identified' }).title).toBe(
      'Contacto creado en «Identificado»',
    );
    expect(describe_('imported', { stage: 'qualified' }).title).toBe(
      'Importado del repositorio en «Cualificado»',
    );
    expect(describe_('note', {}, { body: 'Le interesa el tema.' })).toEqual({
      title: 'Nota',
      detail: 'Le interesa el tema.',
    });
    expect(describe_('stage_changed', { from: 'identified', to: 'contacted' }).title).toBe(
      'Relación: de «Identificado» a «Contactado»',
    );
    expect(describe_('owner_changed', { from: null, to: 'u1' }).title).toBe(
      'Responsable: Ana Ejemplo',
    );
    expect(describe_('owner_changed', { from: 'u1', to: null }).title).toBe(
      'Ya no tiene responsable (antes: Ana Ejemplo)',
    );
    expect(
      describe_('status_changed', { from: 'sent', to: 'replied' }, { campaignId: 'c1' }).title,
    ).toBe('Carta de ejemplo: de «Enviada» a «Ha respondido»');
    expect(
      describe_('sent', { from: 'pending', to: 'sent', templateVersion: 3 }, { campaignId: 'c1' })
        .title,
    ).toBe('Carta enviada en Carta de ejemplo (plantilla, versión 3)');
    expect(describe_('sent', {}, { campaignId: 'c9' }).title).toBe('Carta enviada en una campaña');
    expect(describe_('reviewed').title).toBe('Revisado: ya se le puede escribir');
  });

  it('still says something changed for a kind it does not know, or a value it cannot name', () => {
    expect(describe_('merged').title).toBe('Cambio');
    expect(describe_('stage_changed', { from: 'x', to: 'ally' }).title).toBe(
      'Relación: de «—» a «Aliado»',
    );
    expect(describe_('owner_changed', { to: 'u9' }).title).toBe('Responsable: alguien');
  });
});
