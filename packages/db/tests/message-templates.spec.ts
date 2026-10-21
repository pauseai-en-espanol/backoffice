import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import {
  CENSUS_LINK_ID,
  MESSAGE_TEMPLATE_ID,
  OWN_MESSAGE_TEMPLATE_ID,
  PEOPLE,
  type UserKey,
  USERS,
} from './fixtures.js';

/** Acts as a staff member through the staff app, at aal 2. */
const asStaff = (client: pg.Client, user: UserKey) =>
  actAs(client, 'pauseai_backoffice_app', { userId: USERS[user], aal: 2, channel: 'web' });

/**
 * Writes a template of an onboarder's own through the staff app, as the API does; the SQLSTATE it fails with, or
 * null.
 */
const write = async (
  client: pg.Client,
  template: { purpose: string; body: string; bodyNameless?: string | null; title?: string },
): Promise<string | null> => {
  await asStaff(client, 'onboarder');
  try {
    return await errorCode(
      client,
      `INSERT INTO app.message_templates (purpose, title, body, body_nameless, private_to)
       VALUES ($1::app.message_purpose, $2, $3, $4, $5)`,
      [
        template.purpose,
        template.title ?? 'Mensaje de ejemplo',
        template.body,
        template.bodyNameless ?? null,
        USERS.onboarder,
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
      await asStaff(client, 'adminA');
      await client.query(
        "UPDATE app.message_templates SET title = 'Otro título', active = false WHERE id = $1",
        [MESSAGE_TEMPLATE_ID],
      );
      await client.query('RESET ROLE');
      expect(await version()).toBe(1);
      await asStaff(client, 'adminA');
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
      await asStaff(client, 'adminA');
      expect(
        await errorCode(client, 'UPDATE app.message_templates SET version = 1 WHERE id = $1', [
          MESSAGE_TEMPLATE_ID,
        ]),
      ).toBe('42501');
    });
  });

  it('keep the purpose they were written for', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client, 'onboarder');
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
      await asStaff(client, 'onboarder');
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
      await asStaff(client, 'onboarder');
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

describe('the team’s messages and one’s own (PLAN R71)', () => {
  const insert = (client: pg.Client, privateTo: string | null, title: string) =>
    errorCode(
      client,
      `INSERT INTO app.message_templates (purpose, title, body, private_to)
       VALUES ('welcome', $1, 'Hola: soy {yo}.', $2)`,
      [title, privateTo],
    );

  it('are the team’s, which admins write, or someone’s own, which they alone write', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client, 'onboarder');
      expect(await insert(client, USERS.onboarder, 'Mía')).toBeNull();
      // Not the team's, nor someone else's.
      expect(await insert(client, null, 'Del equipo')).toBe('42501');
      expect(await insert(client, USERS.both, 'De otra persona')).toBe('42501');
      // The team's is out of reach: nothing changes.
      const changed = await client.query(
        "UPDATE app.message_templates SET body = 'Hola: soy {yo}, del equipo.' WHERE id = $1",
        [MESSAGE_TEMPLATE_ID],
      );
      expect(changed.rowCount).toBe(0);
      await client.query('RESET ROLE');
      await asStaff(client, 'adminA');
      expect(await insert(client, null, 'Del equipo')).toBeNull();
    });
  });

  it('stay the team’s or their person’s for good, an admin’s own too', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client, 'adminB');
      const own = (
        await client.query<{ id: string }>(
          `INSERT INTO app.message_templates (purpose, title, body, private_to)
           VALUES ('welcome', 'Mía', 'Hola: soy {yo}.', $1) RETURNING id`,
          [USERS.adminB],
        )
      ).rows[0]?.id;
      expect(
        await errorCode(
          client,
          'UPDATE app.message_templates SET private_to = NULL WHERE id = $1',
          [own],
        ),
      ).toBe('42501');
      expect(
        await errorCode(client, 'UPDATE app.message_templates SET private_to = $2 WHERE id = $1', [
          MESSAGE_TEMPLATE_ID,
          USERS.adminB,
        ]),
      ).toBe('42501');
    });
  });

  it('take a title once among the team’s, and once among each person’s own', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client, 'onboarder');
      // The team's title, for one's own; one's own title, twice.
      expect(await insert(client, USERS.onboarder, 'Bienvenida de ejemplo')).toBeNull();
      expect(await insert(client, USERS.onboarder, 'Mi bienvenida de ejemplo')).toBe('23505');
      await client.query('RESET ROLE');
      // Someone else's own title, which they can't see, is free.
      await asStaff(client, 'both');
      expect(await insert(client, USERS.both, 'Mi bienvenida de ejemplo')).toBeNull();
      await client.query('RESET ROLE');
      await asStaff(client, 'adminA');
      expect(await insert(client, null, 'Bienvenida de ejemplo')).toBe('23505');
    });
  });

  it('are named, in what went out, by their own person alone', async () => {
    await inRolledBackTransaction(async (client) => {
      const census = (
        await client.query<{ id: string }>(
          `INSERT INTO app.message_templates (purpose, title, body, private_to)
           VALUES ('census_link', 'Mi censo', 'Soy {yo}: {enlace}', $1) RETURNING id`,
          [USERS.onboarder],
        )
      ).rows[0]?.id;
      const named = async (user: UserKey) => {
        await asStaff(client, user);
        const attempt = await errorCode(
          client,
          `INSERT INTO app.person_events (person_id, kind, data)
           VALUES ($1, 'contact_attempt', $2::jsonb)`,
          [
            PEOPLE.ana,
            JSON.stringify({
              channel: 'whatsapp',
              outcome: 'left_message',
              templateId: OWN_MESSAGE_TEMPLATE_ID,
              templateVersion: 1,
            }),
          ],
        );
        const link = await errorCode(
          client,
          `INSERT INTO app.census_links (person_id, token_hash, expires_at, template_id, template_version)
           VALUES ($1, md5(random()::text) || md5(random()::text), now() + interval '30 days', $2, 1)`,
          [PEOPLE.ana, census ?? null],
        );
        await client.query('RESET ROLE');
        return { attempt, link };
      };
      expect(await named('onboarder')).toEqual({ attempt: null, link: null });
      expect(await named('both')).toEqual({ attempt: '23514', link: '23514' });
      expect(await named('adminB')).toEqual({ attempt: '23514', link: '23514' });
    });
  });
});
