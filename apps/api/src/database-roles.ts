import type { Database } from '@backoffice/db/client';

import { sql } from 'kysely';

/**
 * Whether a connection logs in as the role its routes assume, and acts as it: the staff routes' as
 * pauseai_backoffice_app. Pointed at the wrong login (the owner's, say), every policy would be skipped, so the server
 * checks before it listens. The login itself, not only the role it acts as: another login with a role setting in its
 * connection string could change that role back.
 */
export const logsInAs = async (db: Database, role: string): Promise<boolean> => {
  const { rows } = await sql<{ login: string; acting: string }>`
    SELECT session_user AS login, current_user AS acting`.execute(db);
  return rows[0]?.login === role && rows[0]?.acting === role;
};
