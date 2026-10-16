import { getTranslator } from '@backoffice/i18n/messages';
import { describe, expect, it } from 'vitest';

import { byHappened, describeContactEvent } from './timeline';

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

  it('says a private contact was shared, merged into this one or on its own (PLAN M5, step 6)', () => {
    expect(describe_('shared').title).toBe('Compartido con el equipo');
    expect(describe_('shared', { merged: true }).title).toBe(
      'Compartido con el equipo, fusionado en este contacto',
    );
  });
});

describe('the order of a timeline (PLAN M5, step 6)', () => {
  it('goes by the day things happened, else the day they were written, newest first', () => {
    const entries = [
      { id: 'written today', happenedOn: null, at: '2026-10-17T09:00:00Z' },
      { id: 'in March', happenedOn: '2026-03-01', at: '2026-10-17T10:00:00Z' },
      { id: 'written later today', happenedOn: null, at: '2026-10-17T11:00:00Z' },
      // Past midnight in Madrid, though not yet in UTC: the 18th.
      { id: 'late at night', happenedOn: null, at: '2026-10-17T22:30:00Z' },
    ];
    expect([...entries].sort(byHappened).map((entry) => entry.id)).toEqual([
      'late at night',
      'written later today',
      'written today',
      'in March',
    ]);
  });
});
