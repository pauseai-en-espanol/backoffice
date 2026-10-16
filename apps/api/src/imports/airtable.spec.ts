import { describe, expect, it } from 'vitest';

import {
  AirtableError,
  isSharedViewUrl,
  mapSharedView,
  readSharedView,
  type SharedView,
} from './airtable.js';

/** A fictional view in the shape Airtable answers: ids, choices and values are made up. */
const view: SharedView = {
  columns: [
    { id: 'fldName', name: 'Full name', type: 'text' },
    { id: 'fldEmail', name: 'Email', type: 'text' },
    { id: 'fldPhone', name: 'Phone', type: 'phone' },
    { id: 'fldCity', name: 'City', type: 'text' },
    {
      id: 'fldLang',
      name: 'Languages',
      type: 'multiSelect',
      typeOptions: {
        choices: {
          selEs: { id: 'selEs', name: 'Spanish' },
          selEs2: { id: 'selEs2', name: 'Español' },
          selCa: { id: 'selCa', name: 'Catalan' },
          selOt: { id: 'selOt', name: 'Other' },
        },
      },
    },
    {
      id: 'fldHow',
      name: 'Discovery method of PAI',
      type: 'select',
      typeOptions: { choices: { selPod: { id: 'selPod', name: 'Podcast / video' } } },
    },
    { id: 'fldOk', name: 'GDPR chapter share permission', type: 'checkbox' },
    { id: 'fldDup', name: 'duplicate', type: 'checkbox' },
    { id: 'fldBio', name: 'Bio', type: 'multilineText' },
  ],
  rows: [
    {
      id: 'recEjemplo0000001',
      // Late on 1 March in UTC: already 2 March in Madrid.
      createdTime: '2026-03-01T23:30:00.000Z',
      cellValuesByColumnId: {
        fldName: ' Ana Ejemplo ',
        fldEmail: 'Ana@Ejemplo.test',
        fldPhone: '612 345 678',
        fldCity: 'Ciudad de ejemplo',
        fldLang: ['selEs', 'selEs2', 'selCa', 'selOt'],
        fldHow: 'selPod',
        fldOk: true,
        fldBio: 'Texto que nunca se copia',
      },
    },
    {
      id: 'recEjemplo0000002',
      cellValuesByColumnId: { fldName: 'Sin permiso', fldEmail: 'b@ejemplo.test' },
    },
    {
      id: 'recEjemplo0000003',
      cellValuesByColumnId: {
        fldName: 'Duplicada',
        fldEmail: 'c@ejemplo.test',
        fldOk: true,
        fldDup: true,
      },
    },
    { id: 'recEjemplo0000004', cellValuesByColumnId: { fldEmail: 'd@ejemplo.test', fldOk: true } },
  ],
};

describe('mapping Global’s view', () => {
  it('copies only the mapped fields, normalised, of rows with the chapter permission; Global’s form is where they came from, the day they signed up (in Madrid) when they arrived', () => {
    const mapped = mapSharedView(view, { requirePermission: true });
    expect(mapped.records).toEqual([
      {
        external_id: 'recEjemplo0000001',
        payload: {
          name: 'Ana Ejemplo',
          airtable_id: 'recEjemplo0000001',
          arrival: 'airtable',
          arrived_on: '2026-03-02',
          emails: ['ana@ejemplo.test'],
          phones: ['+34612345678'],
          town: 'Ciudad de ejemplo',
          languages: ['Español', 'Catalán'],
          how_heard: 'Podcast / video',
        },
      },
    ]);
    expect(JSON.stringify(mapped)).not.toContain('nunca se copia');
    expect(mapped.skipped).toEqual({ noPermission: 1, duplicate: 1, invalid: 1 });
  });

  it('takes rows without the permission when told to (PLAN R14)', () => {
    expect(
      mapSharedView(view, { requirePermission: false }).records.map((r) => r.external_id),
    ).toEqual(['recEjemplo0000001', 'recEjemplo0000002']);
  });

  it('leaves the arrival day to the database when a row doesn’t say when it was made (PLAN M5)', () => {
    const [, other] = mapSharedView(view, { requirePermission: false }).records;
    expect(other?.payload).toEqual({
      name: 'Sin permiso',
      airtable_id: 'recEjemplo0000002',
      arrival: 'airtable',
      emails: ['b@ejemplo.test'],
    });
  });

  it('fails loudly when the columns it needs are gone', () => {
    expect(() =>
      mapSharedView(
        { ...view, columns: view.columns.filter((c) => c.name !== 'Email') },
        { requirePermission: true },
      ),
    ).toThrow(AirtableError);
  });
});

describe('reading the shared view', () => {
  const link = 'https://airtable.com/appEjemplo000001/shrEjemplo0000001';

  it('accepts only an Airtable shared view link', () => {
    expect(isSharedViewUrl(link)).toBe(true);
    expect(isSharedViewUrl('https://example.test/shrEjemplo0000001')).toBe(false);
    expect(isSharedViewUrl('http://airtable.com/appEjemplo000001/shrEjemplo0000001')).toBe(false);
  });

  it('follows the page to the signed data URL, with the headers the page uses', async () => {
    const policy = JSON.stringify({ applicationId: 'appEjemplo000001' });
    const dataPath = `/v0.3/view/viwEjemplo/readSharedViewData?accessPolicy=${encodeURIComponent(policy)}`;
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fake = (async (input: string | URL, init?: RequestInit) => {
      seen.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
      if (String(input) === link) {
        return new Response(
          `<script>window.x = {"urlWithParams":${JSON.stringify(dataPath)}};</script>`,
        );
      }
      return Response.json({
        msg: 'SUCCESS',
        data: { table: { columns: view.columns, rows: view.rows } },
      });
    }) as typeof fetch;
    const read = await readSharedView(link, { fetch: fake });
    expect(read.rows).toHaveLength(4);
    expect(seen[1]?.url).toContain('https://airtable.com/v0.3/view/viwEjemplo/readSharedViewData');
    expect(seen[1]?.headers['x-airtable-application-id']).toBe('appEjemplo000001');
  });

  it('says what failed without ever quoting the link', async () => {
    const failing = (async () => new Response('no', { status: 500 })) as typeof fetch;
    const error = await readSharedView(link, { fetch: failing }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AirtableError);
    expect((error as AirtableError).reason).toBe('page');
    expect(String((error as Error).message)).not.toContain('shrEjemplo');
    const elsewhere = (async (input: string | URL) =>
      String(input) === link
        ? new Response(
            '{"urlWithParams":"https://otro.example.test/v0.3/view/viwX/readSharedViewData"}',
          )
        : Response.json({})) as typeof fetch;
    await expect(readSharedView(link, { fetch: elsewhere })).rejects.toMatchObject({
      reason: 'page',
    });
  });
});
