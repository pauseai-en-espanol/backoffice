import type { DB } from '@backoffice/db/generated/db';
import type { MessagePurpose } from '@backoffice/domain/message-templates';

import { sql, type Transaction } from 'kysely';

/**
 * The messages newcomers receive by WhatsApp, written by the team in Mensajes (PLAN M5): a welcome or a census link's,
 * several per purpose, the first in use being the one offered first. RLS lets onboarding staff and admins read and
 * write them; the database checks their placeholders and counts their versions, and a message in use is retired,
 * never deleted.
 */
export interface MessageTemplate {
  id: string;
  purpose: MessagePurpose;
  title: string;
  body: string;
  bodyNameless: string | null;
  active: boolean;
  version: number;
  updatedAt: string;
  updatedBy: { userId: string; displayName: string } | null;
}

/** Every message, by purpose, those in use first, each purpose's in the order they were written. */
export const listMessageTemplates = async (trx: Transaction<DB>): Promise<MessageTemplate[]> =>
  (
    await sql<MessageTemplate>`
      SELECT m.id, m.purpose, m.title, m.body, m.body_nameless AS "bodyNameless", m.active, m.version,
             to_json(m.updated_at)#>>'{}' AS "updatedAt",
             CASE WHEN s.user_id IS NULL THEN NULL
                  ELSE json_build_object('userId', s.user_id, 'displayName', s.display_name) END AS "updatedBy"
        FROM app.message_templates m
        LEFT JOIN app.staff s ON s.user_id = m.updated_by
       ORDER BY m.purpose, m.active DESC, m.created_at, m.id`.execute(trx)
  ).rows;

/** What a message says, as kept: trimmed, and no version without a name when it's blank. */
const nameless = (text: string | null | undefined): string | null =>
  text === null || text === undefined || text.trim() === '' ? null : text.trim();

export const addMessageTemplate = async (
  trx: Transaction<DB>,
  template: { purpose: MessagePurpose; title: string; body: string; bodyNameless?: string | null },
): Promise<string> => {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.message_templates (purpose, title, body, body_nameless)
    VALUES (${template.purpose}::app.message_purpose, ${template.title.trim()}, ${template.body.trim()},
            ${nameless(template.bodyNameless)})
    RETURNING id`.execute(trx);
  const [row] = rows;
  if (!row) {
    throw new Error('The new message came back with no id');
  }
  return row.id;
};

/** A message's change; false when there's no such message. */
export const changeMessageTemplate = async (
  trx: Transaction<DB>,
  id: string,
  change: {
    title?: string | undefined;
    body?: string | undefined;
    bodyNameless?: string | null | undefined;
    active?: boolean | undefined;
  },
): Promise<boolean> => {
  const sets = [
    ...(change.title === undefined ? [] : [sql`title = ${change.title.trim()}`]),
    ...(change.body === undefined ? [] : [sql`body = ${change.body.trim()}`]),
    ...(change.bodyNameless === undefined
      ? []
      : [sql`body_nameless = ${nameless(change.bodyNameless)}`]),
    ...(change.active === undefined ? [] : [sql`active = ${change.active}`]),
  ];
  if (sets.length === 0) {
    return true;
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.message_templates SET ${sql.join(sets)} WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1;
};

/**
 * The message to offer for a purpose: the one asked for, in use, or else the first in use; undefined when there's
 * none (the code's neutral fallback then), or when the one asked for isn't in use any more (`stale`).
 */
export const messageFor = async (
  trx: Transaction<DB>,
  purpose: MessagePurpose,
  id?: string,
): Promise<
  { id: string; version: number; body: string; bodyNameless: string | null } | 'stale' | undefined
> => {
  const { rows } = await sql<{
    id: string;
    version: number;
    body: string;
    bodyNameless: string | null;
  }>`
    SELECT id, version, body, body_nameless AS "bodyNameless"
      FROM app.message_templates
     WHERE purpose = ${purpose}::app.message_purpose AND active
       AND (${id ?? null}::uuid IS NULL OR id = ${id ?? null}::uuid)
     ORDER BY created_at, id
     LIMIT 1`.execute(trx);
  return rows[0] ?? (id === undefined ? undefined : 'stale');
};
