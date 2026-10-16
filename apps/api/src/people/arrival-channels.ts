import type { DB } from '@backoffice/db/generated/db';

import { sql, type Transaction } from 'kysely';

/**
 * Where people come from, "Llegó por" (PLAN M5): a list onboarding staff choose from and admins edit in Ajustes, as
 * the census's lists. RLS decides who reads and who edits; an entry in use is deactivated, never deleted. `key` marks
 * the entries the backoffice picks itself (the bot's WhatsApp, Global's form), which a rename doesn't break.
 */
export interface ArrivalChannel {
  id: string;
  key: string | null;
  label: string;
  active: boolean;
  position: number;
}

export const listArrivalChannels = async (trx: Transaction<DB>): Promise<ArrivalChannel[]> =>
  (
    await sql<ArrivalChannel>`
      SELECT id, key, label, active, position FROM app.arrival_channels ORDER BY position, label`.execute(
      trx,
    )
  ).rows;

export const addArrivalChannel = async (trx: Transaction<DB>, label: string): Promise<string> => {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.arrival_channels (label, position)
    VALUES (${label}, (SELECT coalesce(max(position), 0) + 1 FROM app.arrival_channels))
    RETURNING id`.execute(trx);
  return rows[0]?.id ?? '';
};

export const changeArrivalChannel = async (
  trx: Transaction<DB>,
  id: string,
  change: { label?: string | undefined; active?: boolean | undefined },
): Promise<boolean> => {
  const sets = [
    ...(change.label === undefined ? [] : [sql`label = ${change.label}`]),
    ...(change.active === undefined ? [] : [sql`active = ${change.active}`]),
  ];
  if (sets.length === 0) {
    return true;
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.arrival_channels SET ${sql.join(sets)} WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1;
};

/** The list's new order, all at once, first to last; false when the ids aren't exactly the list's. */
export const orderArrivalChannels = async (
  trx: Transaction<DB>,
  ids: readonly string[],
): Promise<boolean> => {
  const current = (
    await sql<{ id: string }>`SELECT id FROM app.arrival_channels ORDER BY id FOR UPDATE`.execute(
      trx,
    )
  ).rows.map((row) => row.id);
  if (current.length !== ids.length || !ids.every((id) => current.includes(id))) {
    return false;
  }
  await sql`
    UPDATE app.arrival_channels c SET position = t.n
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS t (id, n)
     WHERE c.id = t.id AND c.position IS DISTINCT FROM t.n`.execute(trx);
  return true;
};
