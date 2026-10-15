import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { withActor } from '../src/actor.js';
import { createDatabase } from '../src/client.js';
import { superuserUrl } from './env.js';
import { USERS } from './fixtures.js';

describe('withActor', () => {
  // One connection, so the "after the transaction" check runs on the connection the actor used.
  const db = createDatabase({ connectionString: superuserUrl(), maxConnections: 1 });

  afterAll(async () => {
    await db.destroy();
  });

  it('exposes the actor and channel to the app role through the private helpers', async () => {
    const seen = await withActor(
      db,
      { userId: USERS.adminA, aal: 2, channel: 'web' },
      async (trx) => {
        await sql`SET LOCAL ROLE pauseai_backoffice_app`.execute(trx);
        const result = await sql<{ user_id: string; aal: number; channel: string; admin: boolean }>`
        SELECT private.current_user_id() AS user_id, private.current_aal() AS aal,
               private.current_channel() AS channel, private.staff_can('admin') AS admin`.execute(
          trx,
        );
        return result.rows[0];
      },
    );
    expect(seen).toEqual({ user_id: USERS.adminA, aal: 2, channel: 'web', admin: true });
  });

  it('does not leak the actor past the transaction', async () => {
    await withActor(db, { userId: USERS.adminA, aal: 1, channel: 'bot' }, async () => undefined);
    const result = await sql<{ user_id: string | null; channel: string | null }>`
      SELECT nullif(current_setting('app.user_id', true), '') AS user_id,
             nullif(current_setting('app.channel', true), '') AS channel`.execute(db);
    expect(result.rows[0]).toEqual({ user_id: null, channel: null });
  });

  it('means "no actor" and no channel when nothing is set', async () => {
    const result = await sql<{ user_id: string | null; aal: number; channel: string | null }>`
      SELECT private.current_user_id() AS user_id, private.current_aal() AS aal,
             private.current_channel() AS channel`.execute(db);
    expect(result.rows[0]).toEqual({ user_id: null, aal: 0, channel: null });
  });

  it('rejects a malformed actor before touching the database', async () => {
    await expect(
      withActor(db, { userId: 'admin', aal: 2, channel: 'web' }, async () => undefined),
    ).rejects.toThrow(/UUID/);
    await expect(
      withActor(db, { userId: USERS.adminA, aal: 3 as 2, channel: 'web' }, async () => undefined),
    ).rejects.toThrow(/aal/);
    await expect(
      withActor(
        db,
        { userId: USERS.adminA, aal: 2, channel: 'mail' as 'web' },
        async () => undefined,
      ),
    ).rejects.toThrow(/channel/);
  });
});
