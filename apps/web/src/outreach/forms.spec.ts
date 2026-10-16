import { describe, expect, it } from 'vitest';

import type { Campaign, ContactDetail, Organisation, Target } from './types';

import {
  campaignChange,
  contactChange,
  listFrom,
  mustStayInReview,
  newCampaign,
  newContact,
  newOrganisation,
  organisationChange,
  positiveInteger,
  targetChange,
  templateInput,
} from './forms';

/** A form's fields as typed: anything not given reads as empty, as an untouched field does. */
const reader =
  (fields: Readonly<Record<string, string>>) =>
  (name: string): string =>
    fields[name] ?? '';

// Fictional records only (CLAUDE.md).
const contact: ContactDetail = {
  id: 'k1',
  orgDisplay: 'Sindicato Ejemplo — Aragón',
  organisation: { id: 'o1', name: 'Sindicato Ejemplo', kind: 'union' },
  organisationId: 'o1',
  personName: 'Berta Ejemplo',
  role: null,
  tier: 'B',
  territory: 'Aragón',
  sector: null,
  stage: 'identified',
  owner: null,
  needsReview: true,
  hold: false,
  tags: ['educación'],
  anonymised: false,
  private: false,
  treatment: 'neutral',
  greetingName: null,
  email: 'berta@ejemplo.test',
  emailsExtra: [],
  phone: null,
  website: null,
  scope: null,
  anchor: null,
  reason: null,
  sources: [],
  holdReason: null,
  notes: null,
  createdAt: '2026-10-15T10:00:00Z',
};

/** The contact's edit form, filled as the page fills it. */
const asTyped = {
  orgDisplay: contact.orgDisplay,
  organisationId: 'o1',
  personName: 'Berta Ejemplo',
  territory: 'Aragón',
  email: 'berta@ejemplo.test',
  treatment: 'neutral',
  tier: 'B',
  stage: 'identified',
  tags: 'educación',
};

describe('lists as typed', () => {
  it('splits by line or comma, without blanks or repeats', () => {
    expect(
      listFrom('https://ejemplo.test/a\n\n https://ejemplo.test/b \r\nhttps://ejemplo.test/a'),
    ).toEqual(['https://ejemplo.test/a', 'https://ejemplo.test/b']);
    expect(listFrom('educación, , sanidad', ',')).toEqual(['educación', 'sanidad']);
  });

  it('reads a positive whole number, empty as none', () => {
    expect(positiveInteger(' 3 ')).toBe(3);
    expect(positiveInteger('')).toBeNull();
    expect(positiveInteger('0')).toBeUndefined();
    expect(positiveInteger('1.5')).toBeUndefined();
    expect(positiveInteger('dos')).toBeUndefined();
  });
});

describe('a new contact', () => {
  it('sends what was filled in, the treatment neutral unless chosen', () => {
    expect(
      newContact(
        reader({
          orgDisplay: ' Sindicato Ejemplo ',
          personName: 'Berta Ejemplo',
          treatment: '',
          tier: 'A',
          stage: 'qualified',
          sources: 'https://ejemplo.test/a\nhttps://ejemplo.test/b',
          tags: 'educación, sanidad',
          reason: 'Dirige el sindicato.',
          holdReason: 'Escrito sin pausa',
        }),
      ),
    ).toEqual({
      orgDisplay: 'Sindicato Ejemplo',
      personName: 'Berta Ejemplo',
      reason: 'Dirige el sindicato.',
      treatment: 'neutral',
      tier: 'A',
      stage: 'qualified',
      tags: ['educación', 'sanidad'],
      sources: ['https://ejemplo.test/a', 'https://ejemplo.test/b'],
      needsReview: false,
      hold: false,
    });
  });

  it('keeps the reason for a hold only when it is held', () => {
    const held = newContact(reader({ orgDisplay: 'X', hold: '1', holdReason: 'Correo personal' }));
    expect(held).toMatchObject({ hold: true, holdReason: 'Correo personal' });
  });

  it('must stay in review without a reason and a source', () => {
    expect(
      mustStayInReview({ reason: 'Dirige el sindicato.', sources: ['https://ejemplo.test'] }),
    ).toBe(false);
    expect(mustStayInReview({ reason: ' ', sources: ['https://ejemplo.test'] })).toBe(true);
    expect(mustStayInReview({ reason: 'Algo', sources: [] })).toBe(true);
    expect(mustStayInReview({})).toBe(true);
  });
});

describe("a contact's changes", () => {
  it('sends nothing when nothing changed', () => {
    expect(contactChange(contact, reader(asTyped))).toEqual({});
  });

  it('sends only what changed, an emptied field as null', () => {
    expect(
      contactChange(
        contact,
        reader({
          ...asTyped,
          personName: '',
          role: 'Secretaría general',
          treatment: 'femenino',
          tags: 'educación, sanidad',
          ownerId: 'u1',
          organisationId: '',
        }),
      ),
    ).toEqual({
      personName: null,
      role: 'Secretaría general',
      treatment: 'femenino',
      tags: ['educación', 'sanidad'],
      ownerId: 'u1',
      organisationId: null,
    });
  });
});

describe('campaigns', () => {
  const campaign: Campaign = {
    id: 'c1',
    slug: 'carta-ejemplo',
    name: 'Carta de ejemplo',
    goal: null,
    language: 'es',
    fromName: null,
    fromEmail: null,
    signature: '',
    status: 'draft',
    owner: null,
    createdAt: '2026-10-15T10:00:00Z',
  };

  it('makes a new one in Spanish unless said otherwise', () => {
    expect(newCampaign(reader({ slug: ' Carta-Ejemplo ', name: 'Carta de ejemplo' }))).toEqual({
      slug: 'carta-ejemplo',
      name: 'Carta de ejemplo',
      language: 'es',
    });
  });

  it('changes only what changed, never the slug', () => {
    expect(
      campaignChange(
        campaign,
        reader({
          slug: 'otra',
          name: 'Carta de ejemplo',
          language: 'es',
          status: 'active',
          fromEmail: 'equipo@ejemplo.test',
          signature: 'Equipo de ejemplo',
        }),
      ),
    ).toEqual({
      status: 'active',
      fromEmail: 'equipo@ejemplo.test',
      signature: 'Equipo de ejemplo',
    });
  });

  it('takes a template whole, its body as written', () => {
    expect(
      templateInput(
        reader({
          subject: ' Asunto ',
          body: '{{saludo}}\r\n\r\nTexto.\r\n',
          maxWords: '250',
          sources: 'https://ejemplo.test',
        }),
      ),
    ).toEqual({
      subject: 'Asunto',
      body: '{{saludo}}\n\nTexto.',
      maxWords: 250,
      sources: ['https://ejemplo.test'],
    });
    expect(templateInput(reader({ subject: 'a', body: 'b', maxWords: 'cien' }))).toBeUndefined();
  });
});

describe('targets', () => {
  const target: Target = {
    id: 't1',
    contact,
    status: 'pending',
    owner: null,
    priority: null,
    anchor: null,
    nextAction: null,
    nextActionDue: null,
    sentAt: null,
    repliedAt: null,
    meetingAt: null,
    notes: null,
  };

  it('sends only what changed', () => {
    expect(targetChange(target, reader({ status: 'pending' }))).toEqual({});
    expect(
      targetChange(
        target,
        reader({
          status: 'ready',
          priority: '2',
          nextAction: 'Llamar',
          nextActionDue: '2026-10-20',
        }),
      ),
    ).toEqual({ status: 'ready', priority: 2, nextAction: 'Llamar', nextActionDue: '2026-10-20' });
  });

  it('refuses a priority that is not a positive whole number', () => {
    expect(targetChange(target, reader({ status: 'pending', priority: '0' }))).toBeUndefined();
  });
});

describe('organisations', () => {
  it('makes a new one as "other" unless a kind is chosen', () => {
    expect(newOrganisation(reader({ name: ' Asociación Ejemplo ' }))).toEqual({
      name: 'Asociación Ejemplo',
      kind: 'other',
    });
  });

  it('is the team’s unless "Solo yo" is chosen, a contact as an organisation (PLAN M5, step 6)', () => {
    expect(newOrganisation(reader({ name: 'A', visibility: 'team' }))).not.toHaveProperty(
      'private',
    );
    expect(newOrganisation(reader({ name: 'A', visibility: 'private' }))).toMatchObject({
      private: true,
    });
    expect(newContact(reader({ orgDisplay: 'X', visibility: 'private' }))).toMatchObject({
      private: true,
    });
    expect(newContact(reader({ orgDisplay: 'X' }))).not.toHaveProperty('private');
  });

  it('changes only what changed', () => {
    const organisation: Organisation = {
      id: 'o1',
      name: 'Asociación Ejemplo',
      kind: 'other',
      territory: null,
      website: null,
      private: false,
      createdAt: '',
    };
    expect(
      organisationChange(
        organisation,
        reader({
          name: 'Asociación Ejemplo',
          kind: 'association',
          website: 'https://ejemplo.test',
        }),
      ),
    ).toEqual({ kind: 'association', website: 'https://ejemplo.test' });
  });
});
