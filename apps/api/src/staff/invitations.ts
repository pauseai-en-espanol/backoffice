import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';

import { getTranslator } from '@backoffice/i18n/messages';
import { sql, type Transaction } from 'kysely';
import { createHash, randomBytes } from 'node:crypto';

import type { Mailer } from '../mail/mailer.js';

import { STAFF_ROLES, type StaffRole } from './staff.js';

/**
 * Invitations (ADR-0002; data model spec, M0 tables): created, listed, revoked and deleted by admins under RLS, in the
 * admin's `withActor` transaction; looked up and accepted through the two narrow functions the database keeps for
 * that. A token is 256 random bits, base64url, carried in the link's fragment; the database holds only its SHA-256,
 * and only that ever reaches it.
 */

/** An invitation expires after this long; the database refuses more than 30 days. */
export const INVITATION_DAYS = 7;

export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  id: string;
  email: string;
  roles: StaffRole[];
  state: InvitationState;
  createdAt: string;
  expiresAt: string;
  createdBy: { userId: string; displayName: string };
}

export const makeInvitationToken = (): string => randomBytes(32).toString('base64url');

export const hashInvitationToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Where the invited person accepts: the token in the fragment, which browsers send to no server. */
export const invitationLink = (staffOrigin: string, token: string): string =>
  `${staffOrigin}/invitacion#token=${encodeURIComponent(token)}`;

const instant = (column: string) => sql<string>`to_json(${sql.ref(column)})#>>'{}'`;

const ordered = (roles: readonly string[]): StaffRole[] =>
  STAFF_ROLES.filter((role) => roles.includes(role));

/** Every invitation RLS shows the actor (admins see them all), newest first. */
export const listInvitations = async (trx: Transaction<DB>): Promise<Invitation[]> => {
  const rows = await trx
    .selectFrom('app.invitations as i')
    .innerJoin('app.staff as s', 's.user_id', 'i.created_by')
    .select([
      'i.id',
      'i.email',
      sql<string[]>`i.roles::text[]`.as('roles'),
      'i.created_by',
      's.display_name',
      instant('i.created_at').as('created_at'),
      instant('i.expires_at').as('expires_at'),
      sql<InvitationState>`CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted'
                                WHEN i.revoked_at IS NOT NULL THEN 'revoked'
                                WHEN i.expires_at <= now() THEN 'expired'
                                ELSE 'pending' END`.as('state'),
    ])
    .orderBy('i.created_at', 'desc')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    roles: ordered(row.roles),
    state: row.state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    createdBy: { userId: row.created_by, displayName: row.display_name },
  }));
};

/**
 * A new invitation: its id. The database stamps who made it and when, and checks the email's shape and the expiry's
 * bounds. Other pending ones for the same email are revoked only once the new one's email went out (revokeOthers).
 */
export const createInvitation = async (
  trx: Transaction<DB>,
  invitation: { email: string; roles: StaffRole[]; tokenHash: string },
): Promise<string> => {
  // Plain SQL: the database stamps `created_by`, which the generated types count as a column to give.
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.invitations (email, roles, token_hash, expires_at)
    VALUES (${invitation.email}, ${`{${invitation.roles.join(',')}}`}::app.staff_role[], ${invitation.tokenHash},
            now() + make_interval(days => ${INVITATION_DAYS}))
    RETURNING id`.execute(trx);
  const [row] = rows;
  if (!row) {
    throw new Error('The new invitation came back with no id');
  }
  return row.id;
};

/** Revokes the other pending invitations for the same email, once a new one went out. */
export const revokeOthers = async (
  trx: Transaction<DB>,
  keep: { id: string; email: string },
): Promise<void> => {
  await trx
    .updateTable('app.invitations')
    .set({ revoked_at: sql`now()` })
    .where('email', '=', keep.email)
    .where('id', '!=', keep.id)
    .where('accepted_at', 'is', null)
    .where('revoked_at', 'is', null)
    .execute();
};

/** Revokes a pending invitation; false if there is no pending one by that id. */
export const revokeInvitation = async (trx: Transaction<DB>, id: string): Promise<boolean> => {
  const updated = await trx
    .updateTable('app.invitations')
    .set({ revoked_at: sql`now()` })
    .where('id', '=', id)
    .where('accepted_at', 'is', null)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return updated.numUpdatedRows > 0n;
};

/**
 * Deletes an accepted, revoked or expired invitation, so its email isn't kept; false if RLS leaves none, as for a
 * pending one.
 */
export const deleteInvitation = async (trx: Transaction<DB>, id: string): Promise<boolean> => {
  const deleted = await trx.deleteFrom('app.invitations').where('id', '=', id).executeTakeFirst();
  return deleted.numDeletedRows > 0n;
};

/**
 * The email and roles of a pending invitation, through the database's narrow lookup, with no actor: whoever holds the
 * link. Undefined for any other token.
 */
export const pendingInvitation = async (
  db: Database,
  token: string,
): Promise<{ email: string; roles: StaffRole[] } | undefined> => {
  const { rows } = await sql<{ email: string; roles: string[] }>`
    SELECT email, roles::text[] AS roles FROM private.pending_invitation(${hashInvitationToken(token)})`.execute(
    db,
  );
  const [row] = rows;
  return row ? { email: row.email, roles: ordered(row.roles) } : undefined;
};

/** Accepts it for the actor, whose verified email must be the invited one; whether it did. */
export const acceptInvitation = async (trx: Transaction<DB>, token: string): Promise<boolean> => {
  const { rows } = await sql<{ done: boolean }>`
    SELECT private.accept_invitation(${hashInvitationToken(token)}) AS done`.execute(trx);
  return rows[0]?.done === true;
};

/** Sends an invitation's email through the backoffice's sender. Rejects if it can't. */
export type InvitationSender = (invitation: {
  email: string;
  roles: StaffRole[];
  /** Who invites, by name; blank for an account without one. */
  inviter: string;
  token: string;
}) => Promise<void>;

/**
 * A name as it may appear in an email's text: one line, no control characters or links, at most 80 characters, so an
 * account's name can't carry a message of its own.
 */
export const plainName = (name: string): string =>
  name
    .replaceAll(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
    .replaceAll(/\b(?:https?:\/\/|www\.)\S*/giu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, 80);

export const createInvitationSender =
  ({
    mailer,
    staffOrigin,
    productName,
  }: {
    mailer: Mailer;
    staffOrigin: string;
    productName: string;
  }): InvitationSender =>
  async ({ email, roles, inviter, token }) => {
    const t = getTranslator();
    const name = plainName(inviter);
    await mailer.send({
      to: email,
      fromName: productName,
      subject: t('email.invitation.subject', { product: productName }),
      text: t('email.invitation.body', {
        inviter: name === '' ? productName : name,
        product: productName,
        roles: roles.map((role) => t(`roles.${role}`)).join(', '),
        days: INVITATION_DAYS,
        link: invitationLink(staffOrigin, token),
      }),
    });
  };
