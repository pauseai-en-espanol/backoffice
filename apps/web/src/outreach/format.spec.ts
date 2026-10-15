import { describe, expect, it } from 'vitest';

import type { Target } from './types';

import {
  contactName,
  countsByStatus,
  fieldNames,
  groupByStatus,
  importFiles,
  type LetterWords,
  priorityLabel,
  problemText,
  queueAfterSkipping,
  queuePositions,
  recogniseFile,
  unknownMergeFields,
  warningText,
} from './format';

const words: LetterWords = {
  needsReview: 'Por revisar.',
  held: 'En pausa.',
  noTemplate: 'Sin plantilla para el nivel {tier}.',
  unknownAnchor: 'No existe «{anchor}».',
  unresolved: 'Faltan: {fields}.',
  emDash: 'Raya en «{context}».',
  enDash: 'Guion en «{context}».',
  phrase: 'Relleno «{found}» en «{context}».',
  long: '{words} de {maxWords}.',
  unknownProblem: 'Otro problema.',
  unknownWarning: 'Otro aviso.',
  fields: { role: 'el cargo', firma: 'la firma', anchor: 'el párrafo' },
};

const ME = 'me';

/** A fictional target: only what the helpers look at differs between them. */
const target = (
  id: string,
  {
    status = 'pending',
    priority = null,
    tier = 'B',
    contact = id,
    owner = null,
    needsReview = false,
    hold = false,
  }: Partial<{
    status: Target['status'];
    priority: number | null;
    tier: 'A' | 'B';
    contact: string;
    owner: string | null;
    needsReview: boolean;
    hold: boolean;
  }> = {},
): Target => ({
  id,
  contact: {
    id: contact,
    orgDisplay: 'Organización de ejemplo',
    organisation: null,
    personName: null,
    role: null,
    tier,
    territory: null,
    sector: null,
    stage: 'identified',
    owner: null,
    needsReview,
    hold,
    tags: [],
    anonymised: false,
  },
  status,
  owner: owner === null ? null : { userId: owner, displayName: 'Persona de ejemplo' },
  priority,
  anchor: null,
  nextAction: null,
  nextActionDue: null,
  sentAt: null,
  repliedAt: null,
  meetingAt: null,
  notes: null,
});

describe("a campaign's board", () => {
  it('groups targets by status in the board order, each group in the order given', () => {
    const targets = [
      target('t1', { status: 'sent' }),
      target('t2'),
      target('t3', { status: 'ready' }),
      target('t4'),
    ];
    expect(
      groupByStatus(targets).map(({ status, targets: group }) => [
        status,
        group.map(({ id }) => id),
      ]),
    ).toEqual([
      ['pending', ['t2', 't4']],
      ['ready', ['t3']],
      ['sent', ['t1']],
    ]);
  });

  it('numbers the queue: only what still waits to go out, in send order', () => {
    const positions = queuePositions([
      target('t1', { status: 'ready' }),
      target('t2', { status: 'sent' }),
      target('t3'),
    ]);
    expect([...positions]).toEqual([
      ['t1', 1],
      ['t3', 2],
    ]);
  });

  it('says a priority, or that there is none', () => {
    const labels = { priority: 'Prioridad {priority}', none: 'Sin prioridad' };
    expect(priorityLabel(1, labels)).toBe('Prioridad 1');
    expect(priorityLabel(null, labels)).toBe('Sin prioridad');
  });

  it('lists the counts by status, in board order, without the empty ones', () => {
    expect(countsByStatus({ sent: 2, pending: 3, ready: 0 })).toEqual({
      rows: [
        ['pending', 3],
        ['sent', 2],
      ],
      total: 5,
    });
  });

  it("names a contact by the person, the organisation's inbox, or as erased", () => {
    const labels = { inbox: 'Buzón de {org}', anonymised: 'Datos borrados' };
    const contact = { orgDisplay: 'Sindicato Ejemplo', anonymised: false };
    expect(contactName({ ...contact, personName: 'Berta Ejemplo' }, labels)).toBe('Berta Ejemplo');
    expect(contactName({ ...contact, personName: null }, labels)).toBe(
      'Buzón de Sindicato Ejemplo',
    );
    expect(contactName({ ...contact, personName: null, anonymised: true }, labels)).toBe(
      'Datos borrados',
    );
  });
});

describe('Siguiente past the targets left for later', () => {
  it("keeps the API's rule: pending or ready, mine or nobody's, a contact that may be written to", () => {
    const entries = [
      target('sent', { status: 'sent' }),
      target('theirs', { owner: 'someone-else' }),
      target('mine', { owner: ME }),
      target('review', { needsReview: true }),
      target('held', { hold: true }),
      target('nobodys', { status: 'ready' }),
      target('skipped'),
    ].map((entry) => ({ target: entry }));
    expect(
      queueAfterSkipping(entries, { me: ME, skip: ['skipped'] }).map(({ target: { id } }) => id),
    ).toEqual(['mine', 'nobodys']);
  });

  it('goes in send order: priority, then tier A before B, then the contact', () => {
    const entries = [
      target('t1', { tier: 'B', contact: 'c1' }),
      target('t2', { tier: 'A', contact: 'c9' }),
      target('t3', { priority: 2, contact: 'c3' }),
      target('t4', { priority: 1, tier: 'B', contact: 'c4' }),
      target('t5', { tier: 'A', contact: 'c5' }),
    ].map((entry) => ({ target: entry }));
    expect(
      queueAfterSkipping(entries, { me: ME, skip: [] }).map(({ target: { id } }) => id),
    ).toEqual(['t4', 't3', 't5', 't2', 't1']);
  });
});

describe("a letter's problems and warnings in words", () => {
  it('says each problem and where to fix it', () => {
    expect(problemText({ kind: 'needsReview' }, words)).toEqual({
      text: 'Por revisar.',
      fixes: ['contact'],
    });
    expect(problemText({ kind: 'held' }, words).fixes).toEqual(['contact']);
    expect(problemText({ kind: 'noTemplate', tier: 'B' }, words)).toEqual({
      text: 'Sin plantilla para el nivel B.',
      fixes: ['templates'],
    });
    expect(problemText({ kind: 'unknownAnchor', anchor: 'empleo' }, words)).toEqual({
      text: 'No existe «empleo».',
      fixes: ['anchors', 'contact'],
    });
    expect(
      problemText(
        { kind: 'prose', issue: { rule: 'emDash', found: '—', context: 'a — b', fatal: true } },
        words,
      ),
    ).toEqual({ text: 'Raya en «a — b».', fixes: ['templates'] });
    expect(problemText({ kind: 'unknown' }, words)).toEqual({ text: 'Otro problema.', fixes: [] });
  });

  it('names the missing fields in words, and sends each to where it is set', () => {
    expect(problemText({ kind: 'unresolved', fields: ['role', 'firma', 'nombre'] }, words)).toEqual(
      {
        text: 'Faltan: el cargo ({{role}}), la firma ({{firma}}), {{nombre}}.',
        fixes: ['contact', 'campaign', 'templates'],
      },
    );
    expect(fieldNames(['anchor'], words.fields)).toBe('el párrafo ({{anchor}})');
  });

  it('says each warning', () => {
    expect(
      warningText(
        {
          kind: 'prose',
          issue: {
            rule: 'phrase',
            found: 'nos complace',
            context: 'hoy nos complace',
            fatal: false,
          },
        },
        words,
      ),
    ).toBe('Relleno «nos complace» en «hoy nos complace».');
    expect(warningText({ kind: 'long', words: 300, maxWords: 250 }, words)).toBe('300 de 250.');
    expect(warningText({ kind: 'unknown' }, words)).toBe('Otro aviso.');
  });
});

describe('templates', () => {
  it('finds the fields that are not merge fields, once each', () => {
    expect(
      unknownMergeFields('{{saludo}} y {{nombre}}', '{{ nombre }}, {{firma}} {{cargo}}'),
    ).toEqual(['nombre', 'cargo']);
    expect(unknownMergeFields('{{saludo}}\n\n{{anchor}}\n\n{{firma}}')).toEqual([]);
  });
});

describe("the outreach repo's files", () => {
  it('recognises each by its name, in any folder and any case', () => {
    expect(recogniseFile('campaign.yaml')).toBe('campaign');
    expect(recogniseFile('campaign.yml')).toBe('campaign');
    expect(recogniseFile('campaigns/ejemplo/contacts/contacts.yaml')).toBe('contacts');
    expect(recogniseFile('templates/anchors.yaml')).toBe('anchors');
    expect(recogniseFile('Tier-A.md')).toBe('A');
    expect(recogniseFile('tier-b.md')).toBe('B');
    expect(recogniseFile('tracking.csv')).toBe('tracking');
    expect(recogniseFile('notes.md')).toBeUndefined();
    expect(recogniseFile('tier-c.md')).toBeUndefined();
  });

  it('builds the request from the files read, or says which required ones are missing', () => {
    expect(importFiles({ campaign: 'c', contacts: 'k', A: 'a', tracking: 't' })).toEqual({
      files: { campaign: 'c', contacts: 'k', templates: { A: 'a' }, tracking: 't' },
    });
    expect(importFiles({ A: 'a' })).toEqual({ missing: ['campaign', 'contacts'] });
    expect(importFiles({ campaign: 'c' })).toEqual({ missing: ['contacts'] });
  });
});
