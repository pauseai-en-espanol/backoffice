import { describe, expect, it } from 'vitest';

import {
  addedCount,
  createdId,
  parseCampaignPage,
  parseCampaigns,
  parseContactPage,
  parseContacts,
  parseHandover,
  parseImportResult,
  parseLetter,
  parseNext,
  parseOrganisationPage,
  parseOrganisations,
  refusedFields,
} from './types';

// Fictional records only (CLAUDE.md): "Ejemplo" names, @ejemplo.test addresses.
const ana = { userId: '0190a0b0-0000-7000-8000-000000000001', displayName: 'Ana Ejemplo' };

const summary = {
  id: '0190a0b0-0000-7000-8000-0000000000c1',
  orgDisplay: 'Sindicato Ejemplo — Aragón',
  organisation: {
    id: '0190a0b0-0000-7000-8000-0000000000a1',
    name: 'Sindicato Ejemplo',
    kind: 'union',
  },
  personName: 'Berta Ejemplo',
  role: 'Secretaría general',
  tier: 'A',
  territory: 'Aragón',
  sector: 'Educación',
  stage: 'identified',
  owner: ana,
  needsReview: false,
  hold: false,
  tags: ['educación'],
  anonymised: false,
  private: false,
};

const target = {
  id: '0190a0b0-0000-7000-8000-0000000000d1',
  contact: summary,
  status: 'pending',
  owner: null,
  priority: 1,
  anchor: null,
  nextAction: null,
  nextActionDue: null,
  sentAt: null,
  repliedAt: null,
  meetingAt: null,
  notes: null,
};

const okLetter = {
  ok: true,
  subject: 'Una carta de ejemplo',
  body: 'Estimado/a Berta Ejemplo:\n\nTexto de ejemplo.',
  words: 6,
  sources: ['https://ejemplo.test/fuente'],
  warnings: [
    {
      kind: 'prose',
      issue: { rule: 'phrase', found: 'nos complace', context: '… nos complace …', fatal: false },
    },
    { kind: 'long', words: 300, maxWords: 250 },
  ],
};

const handover = {
  letter: okLetter,
  to: ['berta@ejemplo.test'],
  cc: [],
  mailto: 'mailto:berta@ejemplo.test?subject=Una%20carta',
  whatsapp: null,
  templateVersion: 2,
};

describe('outreach answers', () => {
  it('reads a contact summary, and refuses one with an unknown stage or tier', () => {
    expect(parseContacts({ contacts: [summary] })).toEqual([summary]);
    expect(parseContacts({ contacts: [{ ...summary, stage: 'friend' }] })).toBeUndefined();
    expect(parseContacts({ contacts: [{ ...summary, tier: 'C' }] })).toBeUndefined();
    expect(parseContacts({})).toBeUndefined();
  });

  it('reads a summary without organisation, owner or person as nulls', () => {
    const [inbox] =
      parseContacts({
        contacts: [
          { ...summary, organisation: null, owner: null, personName: undefined, tags: null },
        ],
      }) ?? [];
    expect(inbox).toMatchObject({ organisation: null, owner: null, personName: null, tags: [] });
  });

  it("reads a contact's page with its campaigns and timeline", () => {
    const page = parseContactPage({
      contact: {
        ...summary,
        organisationId: summary.organisation.id,
        treatment: 'neutral',
        greetingName: null,
        email: 'berta@ejemplo.test',
        emailsExtra: [],
        phone: null,
        website: 'https://ejemplo.test',
        scope: 'estatal',
        anchor: 'empleo',
        reason: 'Dirige el sindicato de ejemplo.',
        sources: ['https://ejemplo.test/fuente'],
        holdReason: null,
        notes: null,
        createdAt: '2026-10-15T10:00:00Z',
      },
      targets: [
        {
          id: target.id,
          campaign: { id: 'c1', slug: 'carta-ejemplo', name: 'Carta de ejemplo' },
          status: 'sent',
          sentAt: '2026-10-15T11:00:00Z',
          repliedAt: null,
          meetingAt: null,
        },
      ],
      timeline: [
        {
          id: 'e1',
          kind: 'sent',
          at: '2026-10-15T11:00:00Z',
          actor: ana,
          channel: 'web',
          campaignId: 'c1',
          body: null,
          data: { from: 'pending', to: 'sent', templateVersion: 2 },
        },
        {
          id: 'e2',
          kind: 'created',
          at: '2026-10-15T10:00:00Z',
          actor: { userId: ana.userId, displayName: null },
          channel: null,
          campaignId: null,
          body: null,
          data: { stage: 'identified' },
        },
      ],
    });
    expect(page?.contact.email).toBe('berta@ejemplo.test');
    expect(page?.targets[0]?.campaign.name).toBe('Carta de ejemplo');
    expect(page?.timeline.map((event) => event.actor)).toEqual([ana, ana.userId]);
  });

  it('refuses a contact with a treatment nobody verified as one of the three', () => {
    expect(
      parseContactPage({ contact: { ...summary, treatment: 'señora' }, targets: [], timeline: [] }),
    ).toBeUndefined();
  });

  it('reads organisations and an organisation page', () => {
    const organisation = {
      id: summary.organisation.id,
      name: 'Sindicato Ejemplo',
      kind: 'union',
      territory: null,
      website: null,
      contacts: 3,
      private: false,
    };
    expect(parseOrganisations({ organisations: [organisation] })).toEqual([organisation]);
    // "Solo yo" (PLAN M5, step 6): only a true from the API makes one private.
    expect(
      parseOrganisations({ organisations: [{ ...organisation, private: true }] })?.[0]?.private,
    ).toBe(true);
    expect(
      parseOrganisations({ organisations: [{ ...organisation, private: 'sí' }] })?.[0]?.private,
    ).toBe(false);
    expect(
      parseOrganisations({ organisations: [{ ...organisation, kind: 'club' }] }),
    ).toBeUndefined();
    const page = parseOrganisationPage({
      organisation: { ...organisation, createdAt: '2026-10-15T10:00:00Z' },
      contacts: [summary],
      notes: [
        {
          id: 'n1',
          body: 'Su junta nos recibió',
          happenedOn: '2026-02-10',
          at: '2026-10-15T10:00:00Z',
          actor: ana,
          channel: 'web',
        },
        { id: 'n2', body: 'Del campo de notas', happenedOn: null, at: '2026-10-15T09:00:00Z' },
      ],
    });
    expect(page?.contacts).toHaveLength(1);
    expect(page?.notes.map((note) => [note.happenedOn, note.actor])).toEqual([
      ['2026-02-10', ana],
      [null, null],
    ]);
    expect(
      parseOrganisationPage({
        organisation: { ...organisation, createdAt: '' },
        notes: [{ id: 'n3', body: 'Sin fecha de escritura' }],
      }),
    ).toBeUndefined();
  });

  it('reads campaigns with their counts, keeping only the statuses it knows', () => {
    const [campaign] =
      parseCampaigns({
        campaigns: [
          {
            id: 'c1',
            slug: 'carta-ejemplo',
            name: 'Carta de ejemplo',
            status: 'active',
            language: 'es',
            owner: null,
            createdAt: '2026-10-15T10:00:00Z',
            counts: { pending: 3, sent: 1, lost: 2, ready: 'x' },
          },
        ],
      }) ?? [];
    expect(campaign?.counts).toEqual({ pending: 3, sent: 1 });
    expect(
      parseCampaigns({ campaigns: [{ id: 'c1', slug: 's', name: 'n', status: 'paused' }] }),
    ).toBe(undefined);
  });

  it("reads a campaign's page: templates, anchors and targets", () => {
    const page = parseCampaignPage({
      campaign: {
        id: 'c1',
        slug: 'carta-ejemplo',
        name: 'Carta de ejemplo',
        goal: null,
        language: 'es',
        fromName: 'Equipo de ejemplo',
        fromEmail: 'equipo@ejemplo.test',
        signature: 'Equipo de ejemplo',
        status: 'draft',
        owner: ana,
        createdAt: '2026-10-15T10:00:00Z',
      },
      templates: [
        {
          tier: 'A',
          subject: 'Asunto',
          body: '{{saludo}}\n\nTexto.',
          maxWords: null,
          sources: [],
          notes: null,
          version: 3,
          updatedAt: '2026-10-15T10:00:00Z',
        },
      ],
      anchors: [
        { key: 'empleo', label: 'Empleo', text: 'Un dato.', sources: ['https://ejemplo.test'] },
      ],
      targets: [target],
    });
    expect(page?.templates[0]?.version).toBe(3);
    expect(page?.anchors[0]?.key).toBe('empleo');
    expect(page?.targets[0]?.priority).toBe(1);
    expect(
      parseCampaignPage({ campaign: {}, templates: [], anchors: [], targets: [] }),
    ).toBeUndefined();
  });
});

describe('letters', () => {
  it('reads a letter that is ok, with its warnings', () => {
    expect(parseLetter(okLetter)).toEqual(okLetter);
  });

  it('reads every problem kind, the no-template one included', () => {
    const letter = parseLetter({
      ok: false,
      problems: [
        { kind: 'needsReview' },
        { kind: 'held' },
        { kind: 'noTemplate', tier: 'B' },
        { kind: 'unknownAnchor', anchor: 'empleo' },
        { kind: 'unresolved', fields: ['role', 'sector'] },
        { kind: 'prose', issue: { rule: 'emDash', found: '—', context: 'a — b', fatal: true } },
      ],
    });
    expect(letter?.ok).toBe(false);
    expect(letter && !letter.ok ? letter.problems.map((problem) => problem.kind) : []).toEqual([
      'needsReview',
      'held',
      'noTemplate',
      'unknownAnchor',
      'unresolved',
      'prose',
    ]);
  });

  it('keeps a problem of a kind it does not know as such, so the letter still reads as not ok', () => {
    expect(parseLetter({ ok: false, problems: [{ kind: 'somethingNew' }] })).toEqual({
      ok: false,
      problems: [{ kind: 'unknown' }],
    });
  });

  it('refuses a known problem that is missing its detail, and a not-ok letter without problems', () => {
    expect(parseLetter({ ok: false, problems: [{ kind: 'noTemplate' }] })).toBeUndefined();
    expect(
      parseLetter({ ok: false, problems: [{ kind: 'unresolved', fields: [1] }] }),
    ).toBeUndefined();
    expect(parseLetter({ ok: false, problems: [] })).toBeUndefined();
  });

  it('reads a handover as is or wrapped, and never offers mail for a letter that is not ok', () => {
    expect(parseHandover(handover)).toEqual(handover);
    expect(parseHandover({ handover })).toEqual(handover);
    expect(
      parseHandover({ ...handover, letter: { ok: false, problems: [{ kind: 'held' }] } })?.mailto,
    ).toBeNull();
  });

  it('only takes links of the kinds it expects', () => {
    const odd = parseHandover({
      ...handover,
      mailto: 'javascript:alert(1)',
      whatsapp: 'http://wa.me/ejemplo',
    });
    expect(odd?.mailto).toBeNull();
    expect(odd?.whatsapp).toBeNull();
  });
});

describe('Siguiente', () => {
  it('reads the next target with its campaign, letter and counts', () => {
    const next = parseNext({
      target,
      campaign: { id: 'c1', slug: 'carta-ejemplo', name: 'Carta de ejemplo' },
      handover,
      remaining: 4,
      blocked: 2,
    });
    expect(next?.target?.id).toBe(target.id);
    expect(next?.handover?.templateVersion).toBe(2);
    expect(next).toMatchObject({ remaining: 4, blocked: 2 });
  });

  it('reads an empty queue', () => {
    expect(
      parseNext({ target: null, campaign: null, handover: null, remaining: 0, blocked: 1 }),
    ).toEqual({ target: null, campaign: null, handover: null, remaining: 0, blocked: 1 });
  });
});

describe('writes', () => {
  it("reads an import's counts, problems and warnings", () => {
    expect(
      parseImportResult({
        dryRun: true,
        counts: { organisations: 2, contacts: 5, targets: 4, templates: 2, anchors: 3, other: 9 },
        problems: [{ file: 'campaign.yaml', message: 'Falta «slug» en campaign.yaml.' }],
        warnings: [
          { file: 'contacts/contacts.yaml', line: 12, message: 'El teléfono de x no se entiende.' },
        ],
      }),
    ).toEqual({
      dryRun: true,
      counts: { organisations: 2, contacts: 5, targets: 4, templates: 2, anchors: 3 },
      problems: [{ file: 'campaign.yaml', line: null, message: 'Falta «slug» en campaign.yaml.' }],
      warnings: [
        { file: 'contacts/contacts.yaml', line: 12, message: 'El teléfono de x no se entiende.' },
      ],
    });
    expect(parseImportResult({ dryRun: false, counts: {}, problems: [{}] })).toBeUndefined();
  });

  it('reads what a write answers', () => {
    expect(createdId({ id: 'c1' })).toBe('c1');
    expect(createdId({})).toBeUndefined();
    expect(addedCount({ added: 3 })).toBe(3);
    expect(addedCount({ added: -1 })).toBeUndefined();
    expect(refusedFields({ error: 'invalid', field: 'body', fields: ['nombre', 2] })).toEqual([
      'nombre',
    ]);
  });
});
