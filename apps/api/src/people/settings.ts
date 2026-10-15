import type { DB } from '@backoffice/db/generated/db';

import { sql, type Transaction } from 'kysely';

/** Thresholds and lists admins edit (onboarding spec: thresholds live in settings, not in code). */
export interface Settings {
  followUpDays: number;
  unresponsiveAttempts: number;
  unresponsiveDays: number;
  unassignedAlertHours: number;
  matchThreshold: number;
  communityChats: string[];
}

export type SettingsChange = Partial<Settings>;

const COLUMNS: Readonly<Record<keyof Settings, string>> = {
  followUpDays: 'follow_up_days',
  unresponsiveAttempts: 'unresponsive_attempts',
  unresponsiveDays: 'unresponsive_days',
  unassignedAlertHours: 'unassigned_alert_hours',
  matchThreshold: 'match_threshold',
  communityChats: 'community_chats',
};

/** Every staff member reads them; RLS shows the row to staff only, so anyone else gets the forbidden answer. */
export const readSettings = async (trx: Transaction<DB>): Promise<Settings> => {
  const { rows } = await sql<Settings>`
    SELECT follow_up_days AS "followUpDays", unresponsive_attempts AS "unresponsiveAttempts",
           unresponsive_days AS "unresponsiveDays", unassigned_alert_hours AS "unassignedAlertHours",
           match_threshold::float8 AS "matchThreshold", community_chats AS "communityChats"
      FROM app.settings`.execute(trx);
  const [row] = rows;
  if (!row) {
    throw Object.assign(new Error('Settings are not visible to this actor'), { code: '42501' });
  }
  return row;
};

/** Admins change them (RLS); chats are trimmed and kept once each. */
export const updateSettings = async (
  trx: Transaction<DB>,
  change: SettingsChange,
): Promise<void> => {
  const sets = (Object.keys(COLUMNS) as (keyof Settings)[])
    .filter((key) => change[key] !== undefined)
    .map((key) => {
      const value =
        key === 'communityChats'
          ? [
              ...new Set(
                (change.communityChats ?? [])
                  .map((chat) => chat.trim())
                  .filter((chat) => chat !== ''),
              ),
            ]
          : change[key];
      return key === 'communityChats'
        ? sql`community_chats = ${value}::text[]`
        : sql`${sql.ref(COLUMNS[key])} = ${value}`;
    });
  if (sets.length > 0) {
    await sql`UPDATE app.settings SET ${sql.join(sets)} WHERE id`.execute(trx);
  }
};
