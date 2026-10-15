import { Kysely, PostgresDialect } from 'kysely';

import type { DB } from './generated/db.js';

import { createPool } from './pool.js';

export type Database = Kysely<DB>;

export interface DatabaseOptions {
  /** Connection string for one runtime role: pauseai_backoffice_app or pauseai_backoffice_ingest. Never the owner. */
  connectionString: string;
  maxConnections?: number;
  applicationName?: string;
}

export const createDatabase = ({
  connectionString,
  maxConnections = 10,
  applicationName,
}: DatabaseOptions): Database =>
  new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: createPool({
        connectionString,
        max: maxConnections,
        application_name: applicationName,
      }),
    }),
  });
