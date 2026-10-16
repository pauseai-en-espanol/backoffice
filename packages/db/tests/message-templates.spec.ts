import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { CENSUS_LINK_ID, MESSAGE_TEMPLATE_ID, PEOPLE, USERS } from './fixtures.js';

/** Writes a template as an onboarder through the staff app, as the API does; the SQLSTATE it fails with, or null. */
const write = async (
  client: pg.Client,
  template: { purpose: string; body: string; bodyNameless?: string | null; title?: string },
): Promise<string | null> => {
  await actAs(client, 'pauseai_backoffice_app', {
    userId: USERS.onboarder,
    aal: 2,
    channel: 'web',
  });
  try {
    return await errorCode(
      client,
      `INSERT INTO app.message_templates (purpose, title, body, body_nameless)
       VALUES ($1::app.message_purpose, $2, $3, $4)`,
      [
        template.purpose,
        template.title ?? 'Mensaje de ejemplo',
        template.body,
        template.bodyNameless ?? null,
      ],
    );
  } finally {
    await client.query('RESET ROLE');
  }
};

const CENSUS = 'Hola, {nombre}: soy {yo}. Tu enlace: {enlace}';
const CENSUS_NAMELESS = 'Hola: soy {yo}. Tu enlace: {enlace}';

describe('the messages the team writes (PLAN M5, Mensajes)', () => {
  it('take only their purpose’s placeholders: {nombre} and {yo}, and {enlace} for the census link', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await write(client, { purpose: 'welcome', body: 'Hola: soy {yo}.' })).toBeNull();
      expect(
        await write(client, { purpose: 'census_link', body: 'Soy {yo}: {enlace}' }),
      ).toBeNull();
      // An unknown one, the census's own in a welcome, and stray braces.
      expect(await write(client, { purpose: 'welcome', body: 'Hola, {name}' })).toBe('23514');
      expect(await write(client, { purpose: 'welcome', body: 'Tu enlace: {enlace}' })).toBe(
        '23514',
      );
      expect(await write(client, { purpose: 'welcome', body: 'Hola {yo' })).toBe('23514');
      expect(await write(client, { purpose: 'welcome', body: 'Hola }' })).toBe('23514');
      // In the version without a name, too.
      expect(
        await write(client, {
          purpose: 'welcome',
          body: 'Hola, {nombre}',
          bodyNameless: 'Hola, {persona}',
        }),
      ).toBe('23514');
    });
  });

  it('need {enlace} in a census link’s message, with or without a name', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await write(client, { purpose: 'census_link', body: 'Hola: soy {yo}.' })).toBe(
        '23514',
      );
      expect(
        await write(client, {
          purpose: 'census_link',
          body: CENSUS,
          bodyNameless: 'Hola: soy {yo}.',
        }),
      ).toBe('23514');
      expect(
        await write(client, {
          purpose: 'census_link',
          body: CENSUS,
          bodyNameless: CENSUS_NAMELESS,
        }),
      ).toBeNull();
    });
  });

  it('say how they read without a name exactly when they use {nombre} (PLAN R37)', async () => {
    await inRolledBackTransaction(async (client) => {
      // {nombre} without its nameless version, and a nameless version with no {nombre} to stand for.
      expect(await write(client, { purpose: 'welcome', body: 'Hola, {nombre}.' })).toBe('23514');
      expect(
        await write(client, { purpose: 'welcome', body: 'Hola.', bodyNameless: 'Hola.' }),
      ).toBe('23514');
      // A nameless version that still names.
      expect(
        await write(client, {
          purpose: 'welcome',
          body: 'Hola, {nombre}.',
          bodyNameless: 'Hola, {nombre}.',
        }),
      ).toBe('23514');
      expect(
        await write(client, { purpose: 'welcome', body: 'Hola, {nombre}.', bodyNameless: 'Hola.' }),
      ).toBeNull();
      // Blank is no version.
      expect(
        await write(client, { purpose: 'welcome', body: 'Hola, {nombre}.', bodyNameless: '  ' }),
      ).toBe('23514');
    });
  });

  it('go up a version with every change to what they say, not to their title or whether in use', async () => {
    await inRolledBackTransaction(async (client) => {
      const version = async () =>
        (
          await client.query<{ version: number }>(
            'SELECT version FROM app.message_templates WHERE id = $1',
            [MESSAGE_TEMPLATE_ID],
          )
        ).rows[0]?.version;
      expect(await version()).toBe(1);
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      await client.query(
        "UPDATE app.message_templates SET title = 'Otro título', active = false WHERE id = $1",
        [MESSAGE_TEMPLATE_ID],
      );
      await client.query('RESET ROLE');
      expect(await version()).toBe(1);
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      await client.query(
        "UPDATE app.message_templates SET body = 'Hola, {nombre}: soy {yo}, de nuevo.' WHERE id = $1",
        [MESSAGE_TEMPLATE_ID],
      );
      await client.query(
        "UPDATE app.message_templates SET body_nameless = 'Hola: soy {yo}, de nuevo.' WHERE id = $1",
        [MESSAGE_TEMPLATE_ID],
      );
      await client.query('RESET ROLE');
      expect(await version()).toBe(3);
      // Nobody writes the version: the database counts.
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      expect(
        await errorCode(client, 'UPDATE app.message_templates SET version = 1 WHERE id = $1', [
          MESSAGE_TEMPLATE_ID,
        ]),
      ).toBe('42501');
    });
  });

  it('keep the purpose they were written for', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      expect(
        await errorCode(
          client,
          "UPDATE app.message_templates SET purpose = 'census_link' WHERE id = $1",
          [MESSAGE_TEMPLATE_ID],
        ),
      ).toBe('42501');
    });
  });
});

describe('a message that went out (PLAN M5, Mensajes)', () => {
  it('names, on its contact attempt, a template and a version it has had', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      const attempt = (data: Record<string, unknown>) =>
        errorCode(
          client,
          `INSERT INTO app.person_events (person_id, kind, data)
           VALUES ($1, 'contact_attempt', $2::jsonb)`,
          [PEOPLE.ana, JSON.stringify({ channel: 'whatsapp', outcome: 'left_message', ...data })],
        );
      expect(await attempt({})).toBeNull();
      expect(await attempt({ templateId: MESSAGE_TEMPLATE_ID, templateVersion: 1 })).toBeNull();
      // A version it hasn't reached, none, or none to go with it.
      expect(await attempt({ templateId: MESSAGE_TEMPLATE_ID, templateVersion: 2 })).toBe('23514');
      expect(await attempt({ templateId: MESSAGE_TEMPLATE_ID, templateVersion: 0 })).toBe('23514');
      expect(await attempt({ templateId: MESSAGE_TEMPLATE_ID })).toBe('23514');
      expect(await attempt({ templateVersion: 1 })).toBe('23514');
      expect(await attempt({ templateId: MESSAGE_TEMPLATE_ID, templateVersion: '1' })).toBe(
        '23514',
      );
      // A template that doesn't exist.
      expect(
        await attempt({ templateId: '0190f8c4-0000-7000-8000-00000000ffff', templateVersion: 1 }),
      ).toBe('23514');
    });
  });
});

describe('a census link’s message (PLAN M5, Mensajes)', () => {
  it('names a census link template and its version together, or neither', async () => {
    await inRolledBackTransaction(async (client) => {
      const census = (
        await client.query<{ id: string }>(
          `INSERT INTO app.message_templates (purpose, title, body)
           VALUES ('census_link', 'Censo', 'Soy {yo}: {enlace}') RETURNING id`,
        )
      ).rows[0]?.id;
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      const link = (template: string | null, version: number | null) =>
        errorCode(
          client,
          `INSERT INTO app.census_links (person_id, token_hash, expires_at, template_id, template_version)
           VALUES ($1, md5(random()::text) || md5(random()::text), now() + interval '30 days', $2, $3)`,
          [PEOPLE.ana, template, version],
        );
      expect(await link(census ?? null, 1)).toBeNull();
      expect(await link(null, null)).toBeNull();
      expect(await link(census ?? null, null)).toBe('23514');
      expect(await link(null, 1)).toBe('23514');
      expect(await link(census ?? null, 0)).toBe('23514');
      // Only a census link's: the welcome's isn't one.
      expect(await link(MESSAGE_TEMPLATE_ID, 1)).toBe('23514');
      // Set when the link is made, never after.
      expect(
        await errorCode(client, 'UPDATE app.census_links SET template_version = 2 WHERE id = $1', [
          CENSUS_LINK_ID,
        ]),
      ).toBe('42501');
    });
  });
});
