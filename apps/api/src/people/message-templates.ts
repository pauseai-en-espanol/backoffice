import type { DB } from '@backoffice/db/generated/db';
import type { MessagePurpose } from '@backoffice/domain/message-templates';

import { sql, type Transaction } from 'kysely';

/**
 * The messages newcomers receive by WhatsApp, written in Mensajes (PLAN M5): a welcome or a census link's, several per
 * purpose, the team's or someone's own (PLAN R71), one's own in use offered first, then the team's. RLS lets onboarding
 * staff and admins read the team's and write their own, which nobody else sees, and admins alone write the team's; the
 * database checks their placeholders and counts their versions, and a message in use is retired, never deleted.
 */
export interface MessageTemplate {
  id: string;
  purpose: MessagePurpose;
  title: string;
  body: string;
  bodyNameless: string | null;
  active: boolean;
  /** One's own ("Solo yo"), rather than the team's. */
  mine: boolean;
  version: number;
  updatedAt: string;
  updatedBy: { userId: string; displayName: string } | null;
}

/**
 * Every message the reader sees (the team's and their own), by purpose, those in use first, their own before the
 * team's, each in the order they were written: the order they're offered.
 */
export const listMessageTemplates = async (trx: Transaction<DB>): Promise<MessageTemplate[]> =>
  (
    await sql<MessageTemplate>`
      SELECT m.id, m.purpose, m.title, m.body, m.body_nameless AS "bodyNameless", m.active,
             m.private_to IS NOT NULL AS mine, m.version,
             to_json(m.updated_at)#>>'{}' AS "updatedAt",
             CASE WHEN s.user_id IS NULL THEN NULL
                  ELSE json_build_object('userId', s.user_id, 'displayName', s.display_name) END AS "updatedBy"
        FROM app.message_templates m
        LEFT JOIN app.staff s ON s.user_id = m.updated_by
       ORDER BY m.purpose, m.active DESC, m.private_to IS NULL, m.created_at, m.id`.execute(trx)
  ).rows;

/** What a message says, as kept: trimmed, and no version without a name when it's blank. */
const nameless = (text: string | null | undefined): string | null =>
  text === null || text === undefined || text.trim() === '' ? null : text.trim();

/** A new message: the writer's own ("Solo yo", `private`), or the team's, which only admins write. */
export const addMessageTemplate = async (
  trx: Transaction<DB>,
  template: {
    purpose: MessagePurpose;
    title: string;
    body: string;
    bodyNameless?: string | null;
    private: boolean;
  },
): Promise<string> => {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.message_templates (purpose, title, body, body_nameless, private_to)
    VALUES (${template.purpose}::app.message_purpose, ${template.title.trim()}, ${template.body.trim()},
            ${nameless(template.bodyNameless)},
            ${template.private ? sql`private.current_user_id()` : sql`NULL::uuid`})
    RETURNING id`.execute(trx);
  const [row] = rows;
  if (!row) {
    throw new Error('The new message came back with no id');
  }
  return row.id;
};

/**
 * A message's change: done; `forbidden` for one of the team's when the writer isn't an admin; `notFound` when there's
 * no such message (someone else's own included, which the writer can't see).
 */
export const changeMessageTemplate = async (
  trx: Transaction<DB>,
  id: string,
  change: {
    title?: string | undefined;
    body?: string | undefined;
    bodyNameless?: string | null | undefined;
    active?: boolean | undefined;
  },
): Promise<'done' | 'forbidden' | 'notFound'> => {
  const sets = [
    ...(change.title === undefined ? [] : [sql`title = ${change.title.trim()}`]),
    ...(change.body === undefined ? [] : [sql`body = ${change.body.trim()}`]),
    ...(change.bodyNameless === undefined
      ? []
      : [sql`body_nameless = ${nameless(change.bodyNameless)}`]),
    ...(change.active === undefined ? [] : [sql`active = ${change.active}`]),
  ];
  const seen = await sql<{ id: string }>`
    SELECT id FROM app.message_templates WHERE id = ${id}`.execute(trx);
  if (seen.rows.length === 0) {
    return 'notFound';
  }
  if (sets.length === 0) {
    return 'done';
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.message_templates SET ${sql.join(sets)} WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1 ? 'done' : 'forbidden';
};

/**
 * The message to offer for a purpose: the one asked for, in use, or else the first in use, one's own before the
 * team's; undefined when there's none (the code's neutral fallback then), or when the one asked for isn't in use any
 * more, or isn't one the writer sees (`stale`).
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
     ORDER BY private_to IS NULL, created_at, id
     LIMIT 1`.execute(trx);
  return rows[0] ?? (id === undefined ? undefined : 'stale');
};
