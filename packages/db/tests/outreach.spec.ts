import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { OUTREACH, USERS } from './fixtures.js';

const asStaff = (client: pg.Client, userId: string = USERS.outreacher) =>
  actAs(client, 'pauseai_backoffice_app', { userId, aal: 2, channel: 'web' });

const kinds = async (client: pg.Client, contact: string): Promise<string[]> =>
  (
    await client.query<{ kind: string }>(
      'SELECT kind::text FROM app.contact_events WHERE contact_id = $1 ORDER BY created_at, id',
      [contact],
    )
  ).rows.map((r) => r.kind);

describe('contacts', () => {
  it('say why they matter, with a source, unless they still need review', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      expect(
        await errorCode(
          client,
          "INSERT INTO app.contacts (org_display, reason) VALUES ('Medio Ejemplo', 'Cubre tecnología')",
        ),
      ).toBe('23514');
      expect(
        await errorCode(client, 'UPDATE app.contacts SET needs_review = false WHERE id = $1', [
          OUTREACH.unreviewed,
        ]),
      ).toBe('23514');
      await client.query(
        `UPDATE app.contacts SET needs_review = false, reason = 'Financia proyectos de ejemplo',
                sources = '{https://ejemplo.test/memoria}' WHERE id = $1`,
        [OUTREACH.unreviewed],
      );
      expect(await kinds(client, OUTREACH.unreviewed)).toEqual(['created', 'reviewed']);
    });
  });

  it('take a verified treatment, a lower-case address and an international phone, or nothing', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      for (const set of [
        "treatment = 'señora'",
        "email = 'Berta@Ejemplo.test'",
        "phone = '600 000 001'",
        "website = 'ejemplo.test'",
      ]) {
        expect(
          await errorCode(client, `UPDATE app.contacts SET ${set} WHERE id = $1`, [OUTREACH.berta]),
        ).toBe('23514');
      }
      await client.query(
        "UPDATE app.contacts SET treatment = 'femenino', phone = '+34600000002' WHERE id = $1",
        [OUTREACH.berta],
      );
    });
  });

  it('write their stage and owner changes to the timeline, with who made them', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      await client.query(
        "UPDATE app.contacts SET stage = 'qualified', owner_id = $2 WHERE id = $1",
        [OUTREACH.berta, USERS.both],
      );
      const { rows } = await client.query(
        `SELECT kind::text, actor_id, channel, data FROM app.contact_events
          WHERE contact_id = $1 AND kind NOT IN ('created', 'note') ORDER BY kind`,
        [OUTREACH.berta],
      );
      expect(rows).toEqual([
        {
          kind: 'owner_changed',
          actor_id: USERS.outreacher,
          channel: 'web',
          data: { from: USERS.outreacher, to: USERS.both },
        },
        {
          kind: 'stage_changed',
          actor_id: USERS.outreacher,
          channel: 'web',
          data: { from: 'identified', to: 'qualified' },
        },
      ]);
    });
  });
});

describe('notes on contacts and organisations (PLAN M5, step 6)', () => {
  it('may say the day they happened, never one to come, and only a note says one', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      await client.query(
        `INSERT INTO app.contact_events (contact_id, kind, body, happened_on)
         VALUES ($1, 'note', 'Hablamos en una jornada', DATE '2026-03-01')`,
        [OUTREACH.berta],
      );
      await client.query(
        `INSERT INTO app.organisation_notes (organisation_id, body, happened_on)
         VALUES ($1, 'Reunión con su junta', DATE '2026-03-02')`,
        [OUTREACH.organisation],
      );
      const tomorrow = "(now() AT TIME ZONE 'Europe/Madrid')::date + 1";
      expect(
        await errorCode(
          client,
          `INSERT INTO app.contact_events (contact_id, kind, body, happened_on)
           VALUES ($1, 'note', 'Mañana', ${tomorrow})`,
          [OUTREACH.berta],
        ),
      ).toBe('23514');
      expect(
        await errorCode(
          client,
          `INSERT INTO app.organisation_notes (organisation_id, body, happened_on)
           VALUES ($1, 'Mañana', ${tomorrow})`,
          [OUTREACH.organisation],
        ),
      ).toBe('23514');
    });
    await inRolledBackTransaction(async (client) => {
      // A stage change, written by the database, is dated by when it was written.
      expect(
        await errorCode(
          client,
          `INSERT INTO app.contact_events (contact_id, kind, data, happened_on)
           VALUES ($1, 'stage_changed', '{}', DATE '2026-03-01')`,
          [OUTREACH.berta],
        ),
      ).toBe('23514');
    });
  });

  it("keep an organisation's notes with who wrote them and when, never changed afterwards", async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO app.organisation_notes (organisation_id, body)
         VALUES ($1, 'Les interesa una charla') RETURNING id`,
        [OUTREACH.organisation],
      );
      const id = rows[0]?.id;
      expect(
        (
          await client.query(
            'SELECT actor_id, channel, created_at IS NOT NULL AS dated FROM app.organisation_notes WHERE id = $1',
            [id],
          )
        ).rows,
      ).toEqual([{ actor_id: USERS.outreacher, channel: 'web', dated: true }]);
      expect(
        await errorCode(client, "UPDATE app.organisation_notes SET body = 'Otra' WHERE id = $1", [
          id,
        ]),
      ).toBe('42501');
      expect(
        await errorCode(
          client,
          "INSERT INTO app.organisation_notes (organisation_id, body) VALUES ($1, '  ')",
          [OUTREACH.organisation],
        ),
      ).toBe('23514');
      // The old notes field is gone: the timeline holds them (PLAN R50).
      expect(
        (
          await client.query(
            "SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'app.organisations'::regclass AND attname = 'notes' AND NOT attisdropped",
          )
        ).rowCount,
      ).toBe(0);
    });
  });
});

describe('private records, "Solo yo" (PLAN M5, step 6)', () => {
  const visible = async (client: pg.Client, table: string, id: string): Promise<boolean> =>
    (await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rowCount === 1;
  const as = async (client: pg.Client, userId: string) => {
    await client.query('RESET ROLE');
    await asStaff(client, userId);
  };

  it('stay with the team once the team has them', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      for (const [table, id] of [
        ['app.contacts', OUTREACH.berta],
        ['app.organisations', OUTREACH.organisation],
      ] as const) {
        expect(
          await errorCode(client, `UPDATE ${table} SET private_to = $2 WHERE id = $1`, [
            id,
            USERS.outreacher,
          ]),
        ).toBe('23514');
      }
    });
  });

  it('when shared, say so on the timeline, and what was written while private stays private', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      await client.query('UPDATE app.organisations SET private_to = NULL WHERE id = $1', [
        OUTREACH.privateOrganisation,
      ]);
      await client.query(
        "INSERT INTO app.contact_events (contact_id, kind, body) VALUES ($1, 'note', 'Antes de compartir')",
        [OUTREACH.privateContact],
      );
      await client.query('UPDATE app.contacts SET private_to = NULL WHERE id = $1', [
        OUTREACH.privateContact,
      ]);
      const events = async () =>
        (
          await client.query<{ kind: string; body: string | null }>(
            'SELECT kind::text, body FROM app.contact_events WHERE contact_id = $1 ORDER BY created_at, id',
            [OUTREACH.privateContact],
          )
        ).rows.map((row) => row.kind);
      expect(await events()).toEqual(['created', 'note', 'shared']);
      await as(client, USERS.both);
      expect(await visible(client, 'app.contacts', OUTREACH.privateContact)).toBe(true);
      expect(await events()).toEqual(['shared']);
    });
  });

  it('take what was written while private along when their person asks, only as they are shared (PLAN R52)', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      await client.query(
        "INSERT INTO app.contact_events (contact_id, kind, body) VALUES ($1, 'note', 'Antes de compartir')",
        [OUTREACH.privateContact],
      );
      const { rows: notes } = await client.query<{ id: string }>(
        "INSERT INTO app.organisation_notes (organisation_id, body) VALUES ($1, 'De la organización privada') RETURNING id",
        [OUTREACH.privateOrganisation],
      );
      await client.query("SELECT set_config('app.share_history', 'on', true)");
      await client.query('UPDATE app.organisations SET private_to = NULL WHERE id = $1', [
        OUTREACH.privateOrganisation,
      ]);
      await client.query('UPDATE app.contacts SET private_to = NULL WHERE id = $1', [
        OUTREACH.privateContact,
      ]);
      // Written for oneself on purpose, once it's the team's: still one's own.
      await client.query(
        "INSERT INTO app.contact_events (contact_id, kind, body, private_to) VALUES ($1, 'note', 'Solo mía', $2)",
        [OUTREACH.privateContact, USERS.outreacher],
      );
      await as(client, USERS.both);
      expect(await visible(client, 'app.organisation_notes', notes[0]?.id ?? '')).toBe(true);
      expect(
        (
          await client.query<{ kind: string; body: string | null }>(
            'SELECT kind::text, body FROM app.contact_events WHERE contact_id = $1 ORDER BY created_at, id',
            [OUTREACH.privateContact],
          )
        ).rows,
      ).toEqual([
        { kind: 'created', body: null },
        { kind: 'note', body: 'Antes de compartir' },
        { kind: 'shared', body: null },
      ]);
      // A private note on a team organisation isn't swept along by another record's sharing.
      expect(
        await visible(client, 'app.organisation_notes', OUTREACH.privateOrganisationNote),
      ).toBe(false);
    });
  });

  it('keep a team contact out of a private organisation, and anyone out of someone else’s', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      expect(
        await errorCode(
          client,
          "INSERT INTO app.contacts (organisation_id, org_display, needs_review) VALUES ($1, 'Privada', true)",
          [OUTREACH.privateOrganisation],
        ),
      ).toBe('23514');
      // Sharing a contact whose organisation is still private: the organisation first.
      expect(
        await errorCode(client, 'UPDATE app.contacts SET private_to = NULL WHERE id = $1', [
          OUTREACH.privateContact,
        ]),
      ).toBe('23514');
      await as(client, USERS.both);
      expect(
        await errorCode(
          client,
          `INSERT INTO app.contacts (organisation_id, org_display, needs_review, private_to)
           VALUES ($1, 'Ajena', true, $2)`,
          [OUTREACH.privateOrganisation, USERS.both],
        ),
      ).toBe('23514');
    });
  });

  it('keep what is written on a private contact or organisation as private as it', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      const { rows } = await client.query<{ private_to: string | null }>(
        `INSERT INTO app.contact_events (contact_id, kind, body) VALUES ($1, 'note', 'Para mí')
         RETURNING private_to`,
        [OUTREACH.privateContact],
      );
      expect(rows).toEqual([{ private_to: USERS.outreacher }]);
      const note = await client.query<{ private_to: string | null }>(
        `INSERT INTO app.organisation_notes (organisation_id, body) VALUES ($1, 'Para mí')
         RETURNING private_to`,
        [OUTREACH.privateOrganisation],
      );
      expect(note.rows).toEqual([{ private_to: USERS.outreacher }]);
      await as(client, USERS.both);
      expect(await visible(client, 'app.contact_events', OUTREACH.privateNote)).toBe(false);
      expect(
        await visible(client, 'app.organisation_notes', OUTREACH.privateOrganisationNote),
      ).toBe(false);
      await as(client, USERS.adminA);
      expect(await visible(client, 'app.contacts', OUTREACH.privateContact)).toBe(false);
      expect(await visible(client, 'app.contact_events', OUTREACH.privateNote)).toBe(false);
    });
  });

  it('are never written to by a campaign, whoever adds them', async () => {
    for (const userId of [USERS.outreacher, USERS.both]) {
      await inRolledBackTransaction(async (client) => {
        await asStaff(client, userId);
        expect(
          await errorCode(
            client,
            'INSERT INTO app.campaign_targets (campaign_id, contact_id) VALUES ($1, $2)',
            [OUTREACH.campaign, OUTREACH.privateContact],
          ),
        ).toBe('23514');
      });
    }
  });

  it('reach a rights request through admins’ own functions: found by email, exported and recorded', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client, USERS.adminA);
      expect(
        (await client.query('SELECT * FROM private.rights_contacts($1)', [' Carla@Ejemplo.test ']))
          .rows,
      ).toEqual([
        {
          id: OUTREACH.privateContact,
          org_display: 'Asociación Privada de Ejemplo',
          person_name: 'Carla Ejemplo',
          is_private: true,
        },
      ]);
      const exported = (
        await client.query<{ data: { contact: Record<string, unknown>; timeline: unknown[] } }>(
          'SELECT private.export_contact($1) AS data',
          [OUTREACH.berta],
        )
      ).rows[0]?.data;
      expect(exported?.contact).toMatchObject({ person_name: 'Berta Ejemplo' });
      expect(exported?.contact).not.toHaveProperty('private_to');
      expect(JSON.stringify(exported?.timeline)).toContain('Una nota privada sobre Berta');
      expect(
        (await client.query("SELECT kind, filter FROM app.exports WHERE kind = 'contact_json'"))
          .rows,
      ).toEqual([{ kind: 'contact_json', filter: { contact: OUTREACH.berta } }]);
      await as(client, USERS.outreacher);
      for (const call of [
        "SELECT * FROM private.rights_contacts('carla@ejemplo.test')",
        `SELECT private.export_contact('${OUTREACH.berta}')`,
      ]) {
        expect(await errorCode(client, call)).toBe('42501');
      }
    });
  });

  it('of someone who left go to whoever an admin chooses in outreach, counted but never shown', async () => {
    await inRolledBackTransaction(async (client) => {
      // The outreacher's records, as if they had left.
      await client.query('UPDATE app.staff SET active = false WHERE user_id = $1', [
        USERS.outreacher,
      ]);
      await asStaff(client, USERS.adminA);
      expect((await client.query('SELECT * FROM private.private_records()')).rows).toEqual([
        { user_id: USERS.outreacher, contacts: 1, organisations: 1, notes: 2 },
      ]);
      // Not to someone without outreach, nor from someone still here.
      expect(
        await errorCode(client, 'SELECT private.hand_over_private($1, $2)', [
          USERS.outreacher,
          USERS.onboarder,
        ]),
      ).toBe('23514');
      expect(
        await errorCode(client, 'SELECT private.hand_over_private($1, $2)', [
          USERS.both,
          USERS.adminA,
        ]),
      ).toBe('23514');
      expect(
        (
          await client.query<{ moved: number }>(
            'SELECT private.hand_over_private($1, $2) AS moved',
            [USERS.outreacher, USERS.both],
          )
        ).rows,
        // The organisation, the contact, its first event, the note on Berta and the one on the organisation.
      ).toEqual([{ moved: 5 }]);
      expect((await client.query('SELECT * FROM private.private_records()')).rows).toEqual([]);
      await as(client, USERS.both);
      expect(await visible(client, 'app.contacts', OUTREACH.privateContact)).toBe(true);
      expect(await visible(client, 'app.contact_events', OUTREACH.privateNote)).toBe(true);
      expect(await visible(client, 'app.organisations', OUTREACH.privateOrganisation)).toBe(true);
      expect(await errorCode(client, 'SELECT * FROM private.private_records()')).toBe('42501');
    });
  });

  it('merge into the team contact that is the same person, keeping the private timeline private', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      // Another member can't merge the outreacher's.
      await as(client, USERS.both);
      expect(
        (
          await client.query<{ done: boolean }>(
            'SELECT private.merge_private_contact($1, $2) AS done',
            [OUTREACH.privateContact, OUTREACH.berta],
          )
        ).rows,
      ).toEqual([{ done: false }]);
      await as(client, USERS.outreacher);
      await client.query("UPDATE app.contacts SET phone = '+34600000003' WHERE id = $1", [
        OUTREACH.privateContact,
      ]);
      expect(
        (
          await client.query<{ done: boolean }>(
            'SELECT private.merge_private_contact($1, $2) AS done',
            [OUTREACH.privateContact, OUTREACH.berta],
          )
        ).rows,
      ).toEqual([{ done: true }]);
      expect(await visible(client, 'app.contacts', OUTREACH.privateContact)).toBe(false);
      expect(
        (
          await client.query(
            'SELECT person_name, email, emails_extra, phone FROM app.contacts WHERE id = $1',
            [OUTREACH.berta],
          )
        ).rows,
      ).toEqual([
        {
          person_name: 'Berta Ejemplo',
          email: 'berta@ejemplo.test',
          emails_extra: ['carla@ejemplo.test'],
          phone: '+34600000003',
        },
      ]);
      const kinds_ = async () =>
        (
          await client.query<{ kind: string }>(
            "SELECT kind::text FROM app.contact_events WHERE contact_id = $1 AND kind IN ('created', 'shared') ORDER BY created_at, id",
            [OUTREACH.berta],
          )
        ).rows.map((row) => row.kind);
      expect(await kinds_()).toEqual(['created', 'created', 'shared']);
      await as(client, USERS.both);
      expect(await kinds_()).toEqual(['created', 'shared']);
    });
  });

  it('merge with the private timeline when their person asks, and nothing else of theirs (PLAN R52)', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      await client.query("UPDATE app.contacts SET phone = '+34600000003' WHERE id = $1", [
        OUTREACH.privateContact,
      ]);
      await client.query("SELECT set_config('app.share_history', 'on', true)");
      expect(
        (
          await client.query<{ done: boolean }>(
            'SELECT private.merge_private_contact($1, $2) AS done',
            [OUTREACH.privateContact, OUTREACH.berta],
          )
        ).rows,
      ).toEqual([{ done: true }]);
      await as(client, USERS.both);
      expect(
        (
          await client.query<{ kind: string }>(
            "SELECT kind::text FROM app.contact_events WHERE contact_id = $1 AND kind IN ('created', 'shared') ORDER BY created_at, id",
            [OUTREACH.berta],
          )
        ).rows.map((row) => row.kind),
      ).toEqual(['created', 'created', 'shared']);
      // The private note written on the team's contact before stays its author's.
      expect(await visible(client, 'app.contact_events', OUTREACH.privateNote)).toBe(false);
    });
  });
});

describe('campaign targets', () => {
  it('are never made ready or sent while their contact needs review or is held', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      expect(
        await errorCode(
          client,
          "INSERT INTO app.campaign_targets (campaign_id, contact_id, status) VALUES ($1, $2, 'ready')",
          [OUTREACH.campaign, OUTREACH.unreviewed],
        ),
      ).toBe('23514');
      await client.query(
        'INSERT INTO app.campaign_targets (campaign_id, contact_id) VALUES ($1, $2)',
        [OUTREACH.campaign, OUTREACH.unreviewed],
      );
      expect(
        await errorCode(
          client,
          "UPDATE app.campaign_targets SET status = 'ready' WHERE contact_id = $1",
          [OUTREACH.unreviewed],
        ),
      ).toBe('23514');
      await client.query(
        "UPDATE app.contacts SET hold = true, hold_reason = 'Lo lleva otro equipo' WHERE id = $1",
        [OUTREACH.berta],
      );
      expect(
        await errorCode(client, "UPDATE app.campaign_targets SET status = 'sent' WHERE id = $1", [
          OUTREACH.pendingTarget,
        ]),
      ).toBe('23514');
      await client.query('UPDATE app.contacts SET hold = false WHERE id = $1', [OUTREACH.berta]);
      await client.query("UPDATE app.campaign_targets SET status = 'ready' WHERE id = $1", [
        OUTREACH.pendingTarget,
      ]);
    });
  });

  it('stamp the date of a send, a reply and a meeting, and move the relationship forward only', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      await client.query(
        "UPDATE app.campaign_targets SET status = 'sent', template_version = 1 WHERE id = $1",
        [OUTREACH.pendingTarget],
      );
      const stage = async () =>
        (
          await client.query<{ stage: string }>(
            'SELECT stage::text FROM app.contacts WHERE id = $1',
            [OUTREACH.berta],
          )
        ).rows[0]?.stage;
      expect(await stage()).toBe('contacted');
      await client.query("UPDATE app.campaign_targets SET status = 'replied' WHERE id = $1", [
        OUTREACH.pendingTarget,
      ]);
      expect(await stage()).toBe('engaged');
      await client.query("UPDATE app.contacts SET stage = 'ally' WHERE id = $1", [OUTREACH.berta]);
      await client.query("UPDATE app.campaign_targets SET status = 'meeting' WHERE id = $1", [
        OUTREACH.pendingTarget,
      ]);
      expect(await stage()).toBe('ally');
      const { rows } = await client.query(
        `SELECT sent_at IS NOT NULL AS sent, replied_at IS NOT NULL AS replied, meeting_at IS NOT NULL AS met
           FROM app.campaign_targets WHERE id = $1`,
        [OUTREACH.pendingTarget],
      );
      expect(rows[0]).toEqual({ sent: true, replied: true, met: true });
      const sent = await client.query(
        "SELECT campaign_id, data FROM app.contact_events WHERE contact_id = $1 AND kind = 'sent'",
        [OUTREACH.berta],
      );
      expect(sent.rows).toEqual([
        {
          campaign_id: OUTREACH.campaign,
          data: { from: 'pending', to: 'sent', templateVersion: 1 },
        },
      ]);
    });
  });

  it('keep a date already recorded, and stay in a campaign once someone has written to them', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      const before = await client.query<{ sent_at: Date }>(
        'SELECT sent_at FROM app.campaign_targets WHERE id = $1',
        [OUTREACH.sentTarget],
      );
      await client.query("UPDATE app.campaign_targets SET status = 'bounced' WHERE id = $1", [
        OUTREACH.sentTarget,
      ]);
      await client.query("UPDATE app.campaign_targets SET status = 'sent' WHERE id = $1", [
        OUTREACH.sentTarget,
      ]);
      const after = await client.query<{ sent_at: Date }>(
        'SELECT sent_at FROM app.campaign_targets WHERE id = $1',
        [OUTREACH.sentTarget],
      );
      expect(after.rows[0]?.sent_at).toEqual(before.rows[0]?.sent_at);
      const deleted = await client.query('DELETE FROM app.campaign_targets WHERE id = $1', [
        OUTREACH.sentTarget,
      ]);
      expect(deleted.rowCount).toBe(0);
    });
  });
});

describe('history', () => {
  it('stays once someone wrote to a target: it never goes back to the queue, nor out of the campaign', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      for (const status of ['pending', 'ready', 'skip']) {
        expect(
          await errorCode(client, 'UPDATE app.campaign_targets SET status = $2 WHERE id = $1', [
            OUTREACH.sentTarget,
            status,
          ]),
        ).toBe('23514');
      }
      // Moving on is fine: a bounce, a reply.
      await client.query("UPDATE app.campaign_targets SET status = 'bounced' WHERE id = $1", [
        OUTREACH.sentTarget,
      ]);
      const deleted = await client.query('DELETE FROM app.campaign_targets WHERE id = $1', [
        OUTREACH.sentTarget,
      ]);
      expect(deleted.rowCount).toBe(0);
    });
  });

  it('starts in the queue: only an admin (the importer) adds a target already written to', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      const insert = (columns: string, values: string) =>
        errorCode(
          client,
          `INSERT INTO app.campaign_targets (campaign_id, contact_id, ${columns}) VALUES ($1, $2, ${values})`,
          [OUTREACH.campaign, OUTREACH.unreviewed],
        );
      expect(await insert('status', "'sent'")).toBe('42501');
      expect(await insert('status', "'replied'")).toBe('42501');
      expect(await insert('sent_at', "now() - interval '1 day'")).toBe('42501');
      expect(await insert('replied_at', "now() - interval '1 day'")).toBe('42501');
      expect(await insert('meeting_at', "now() - interval '1 day'")).toBe('42501');
      expect(await insert('status', "'skip'")).toBeNull();
      await client.query('DELETE FROM app.campaign_targets WHERE contact_id = $1', [
        OUTREACH.unreviewed,
      ]);
      await asStaff(client, USERS.adminA);
      expect(
        await insert('status, sent_at, replied_at', "'replied', now() - interval '2 days', now()"),
      ).toBeNull();
    });
  });
});

describe('templates', () => {
  it('count a version for every change to the subject or body, and only those', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      const version = async () =>
        (
          await client.query<{ version: number }>(
            "SELECT version FROM app.campaign_templates WHERE campaign_id = $1 AND tier = 'A'",
            [OUTREACH.campaign],
          )
        ).rows[0]?.version;
      expect(await version()).toBe(1);
      await client.query(
        "UPDATE app.campaign_templates SET notes = 'Revisada' WHERE campaign_id = $1",
        [OUTREACH.campaign],
      );
      expect(await version()).toBe(1);
      await client.query(
        "UPDATE app.campaign_templates SET body = body || ' ' WHERE campaign_id = $1",
        [OUTREACH.campaign],
      );
      await client.query(
        "UPDATE app.campaign_templates SET subject = 'Otro' WHERE campaign_id = $1",
        [OUTREACH.campaign],
      );
      expect(await version()).toBe(3);
      // The version is the database's to count.
      expect(
        await errorCode(
          client,
          'UPDATE app.campaign_templates SET version = 9 WHERE campaign_id = $1',
          [OUTREACH.campaign],
        ),
      ).toBe('42501');
    });
  });

  it('take only anchors with a source', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      expect(
        await errorCode(
          client,
          `INSERT INTO app.campaign_anchors (campaign_id, key, label, text, sources)
           VALUES ($1, 'vivienda', 'Vivienda', 'Una cifra sin fuente.', '{}')`,
          [OUTREACH.campaign],
        ),
      ).toBe('23514');
    });
  });
});

describe('erasure of a contact', () => {
  it('is for admins only: their details, notes and timeline words go, and they are held for good', async () => {
    await inRolledBackTransaction(async (client) => {
      await asStaff(client);
      await client.query(
        "INSERT INTO app.contact_events (contact_id, kind, body) VALUES ($1, 'note', 'Algo que dijo')",
        [OUTREACH.berta],
      );
      await client.query(
        "UPDATE app.campaign_targets SET notes = 'Llamar', next_action = 'Seguimiento' WHERE id = $1",
        [OUTREACH.pendingTarget],
      );
      expect(
        await errorCode(client, 'SELECT private.anonymise_contact($1)', [OUTREACH.berta]),
      ).toBe('42501');
      await client.query('RESET ROLE');
      await asStaff(client, USERS.adminA);
      const done = async () =>
        (
          await client.query<{ done: boolean }>('SELECT private.anonymise_contact($1) AS done', [
            OUTREACH.berta,
          ])
        ).rows[0]?.done;
      expect(await done()).toBe(true);
      expect(await done()).toBe(false);
      const { rows } = await client.query(
        `SELECT person_name, email, notes, role, reason, sources, hold, owner_id, org_display,
                anonymised_at IS NOT NULL AS gone
           FROM app.contacts WHERE id = $1`,
        [OUTREACH.berta],
      );
      expect(rows[0]).toEqual({
        person_name: null,
        email: null,
        notes: null,
        role: null,
        reason: null,
        sources: [],
        hold: true,
        owner_id: null,
        org_display: 'Asociación Ejemplo',
        gone: true,
      });
      const notes = await client.query(
        "SELECT body FROM app.contact_events WHERE contact_id = $1 AND kind = 'note'",
        [OUTREACH.berta],
      );
      expect(notes.rows).toEqual([{ body: null }]);
      const target = await client.query(
        'SELECT notes, next_action, status::text FROM app.campaign_targets WHERE id = $1',
        [OUTREACH.pendingTarget],
      );
      expect(target.rows[0]).toEqual({ notes: null, next_action: null, status: 'pending' });
      // Nobody brings them back, or writes to them again.
      const changed = await client.query(
        "UPDATE app.contacts SET email = 'berta@ejemplo.test', hold = false WHERE id = $1",
        [OUTREACH.berta],
      );
      expect(changed.rowCount).toBe(0);
      expect(
        await errorCode(client, "UPDATE app.campaign_targets SET status = 'ready' WHERE id = $1", [
          OUTREACH.pendingTarget,
        ]),
      ).toBe('23514');
      // The audit log names what changed without copying it.
      const audit = await client.query<{ diff: string }>(
        `SELECT diff::text FROM app.audit_log WHERE table_name = 'contacts' AND row_id = $1
          ORDER BY id DESC LIMIT 1`,
        [OUTREACH.berta],
      );
      expect(audit.rows[0]?.diff).not.toContain('berta@ejemplo.test');
    });
  });
});
