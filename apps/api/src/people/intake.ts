import type { DB } from '@backoffice/db/generated/db';
import type { Stage } from '@backoffice/domain/stages';

import { sql, type Transaction } from 'kysely';

/**
 * Intake from the staff app (onboarding spec, intake sources): quick-add, the duplicate check as you type, the Bandeja
 * and CSV imports, all through the database's functions, which run the one matcher every source shares.
 */

export interface Candidate {
  personId: string;
  name: string;
  stage: Stage;
  owner: string | null;
  exact: boolean;
}

/** People an arrival may already be: those holding its phone or email, then those with a similar name. */
export const findCandidates = async (
  trx: Transaction<DB>,
  arrival: { name: string; province?: string | undefined; phones: string[]; emails: string[] },
): Promise<Candidate[]> => {
  const { rows } = await sql<{
    person_id: string;
    name: string;
    stage: Stage;
    owner_name: string | null;
    exact: boolean;
  }>`
    SELECT person_id, name, stage::text AS stage, owner_name, exact
      FROM private.bot_candidates(${arrival.name}, ${arrival.province ?? null}, ${arrival.phones}::text[],
                                  ${arrival.emails}::text[])`.execute(trx);
  return rows.map((row) => ({
    personId: row.person_id,
    name: row.name,
    stage: row.stage,
    owner: row.owner_name,
    exact: row.exact,
  }));
};

/** What an intake record carries, as the matcher takes it (migration intake: check_payload). */
export interface IntakePayload {
  name?: string;
  preferred_name?: string;
  emails?: string[];
  phones?: string[];
  airtable_id?: string;
  province?: string;
  town?: string;
  languages?: string[];
  how_heard?: string;
  chat?: string;
  note?: string;
  stage?: 'to_triage' | 'new' | 'welcomed' | 'active';
  joined_on?: string;
}

export interface Submitted {
  intakeId: string;
  status: 'pending' | 'attached' | 'created' | 'review' | 'conflict' | 'discarded';
  personId: string | null;
}

/** A report, quick-add or bot arrival: one intake record, matched at once. Idempotent by `externalId`. */
export const submitIntake = async (
  trx: Transaction<DB>,
  {
    source,
    externalId,
    payload,
    decision,
    target,
  }: {
    source: 'manual' | 'telegram';
    externalId: string;
    payload: IntakePayload;
    decision?: 'new' | 'attach' | undefined;
    target?: string | undefined;
  },
): Promise<Submitted> => {
  const { rows } = await sql<{
    intake_id: string;
    status: Submitted['status'];
    person_id: string | null;
  }>`
    SELECT intake_id, status::text AS status, person_id
      FROM private.submit_intake(${source}::app.source_kind, ${externalId}, ${JSON.stringify(payload)}::jsonb,
                                 ${decision ?? null}, ${target ?? null}::uuid)`.execute(trx);
  const [row] = rows;
  if (!row) {
    throw new Error('submit_intake answered nothing');
  }
  return { intakeId: row.intake_id, status: row.status, personId: row.person_id };
};

export interface BandejaItem {
  id: string;
  source: string;
  status: 'review' | 'conflict';
  name: string | null;
  province: string | null;
  town: string | null;
  reportedBy: string | null;
  createdAt: string;
  candidates: string[];
  personId: string | null;
  conflicts: Record<string, { current: unknown; proposed: unknown }> | Record<string, unknown>;
}

/**
 * Records waiting for a person's decision: possible duplicates and conflicting values, oldest first. Only what the
 * decision needs of the payload (name, province, town), never its contact details.
 */
export const listBandeja = async (trx: Transaction<DB>): Promise<BandejaItem[]> => {
  const { rows } = await sql<{
    id: string;
    source: string;
    status: 'review' | 'conflict';
    name: string | null;
    province: string | null;
    town: string | null;
    reported_by: string | null;
    created_at: string;
    candidates: string[];
    person_id: string | null;
    conflicts: Record<string, unknown>;
  }>`
    SELECT i.id, i.source::text AS source, i.status::text AS status, i.payload ->> 'name' AS name,
           i.payload ->> 'province' AS province, i.payload ->> 'town' AS town, s.display_name AS reported_by,
           to_json(i.created_at)#>>'{}' AS created_at, i.candidates, i.person_id, i.conflicts - 'identities'
             || CASE WHEN i.conflicts ? 'identities'
                     THEN jsonb_build_object('identities', jsonb_array_length(i.conflicts -> 'identities'))
                     ELSE '{}' END AS conflicts
      FROM app.intake_records i
      LEFT JOIN app.staff s ON s.user_id = i.reported_by
     WHERE i.status IN ('review', 'conflict')
     ORDER BY i.created_at
     LIMIT 200`.execute(trx);
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    status: row.status,
    name: row.name,
    province: row.province,
    town: row.town,
    reportedBy: row.reported_by,
    createdAt: row.created_at,
    candidates: row.candidates,
    personId: row.person_id,
    conflicts: row.conflicts,
  }));
};

export const resolveBandeja = async (
  trx: Transaction<DB>,
  id: string,
  decision: 'attach' | 'new' | 'discard' | 'apply' | 'keep',
  target: string | undefined,
): Promise<string> => {
  const { rows } = await sql<{ status: string }>`
    SELECT private.resolve_intake(${id}, ${decision}, ${target ?? null}::uuid)::text AS status`.execute(
    trx,
  );
  return rows[0]?.status ?? 'unknown';
};

/** A CSV import's rows, mapped and normalised, through the database's function; its counts. */
export const importCsv = async (
  trx: Transaction<DB>,
  fileSha256: string,
  rows: { payload: IntakePayload }[],
): Promise<Record<string, unknown>> => {
  const result = await sql<{ counts: Record<string, unknown> }>`
    SELECT private.import_csv(${fileSha256}, ${JSON.stringify(rows)}::jsonb) AS counts`.execute(
    trx,
  );
  return result.rows[0]?.counts ?? {};
};

export interface ImportRun {
  id: string;
  kind: string;
  startedAt: string;
  finishedAt: string | null;
  /** Who ran it; null for the scheduled sync. */
  startedBy: { userId: string; displayName: string } | null;
  counts: Record<string, unknown>;
}

/** The latest import runs, newest first. */
export const listImports = async (trx: Transaction<DB>): Promise<ImportRun[]> => {
  const { rows } = await sql<{
    id: string;
    kind: string;
    started_at: string;
    finished_at: string | null;
    started_by: string | null;
    started_by_name: string | null;
    counts: Record<string, unknown>;
  }>`
    SELECT i.id, i.kind, to_json(i.started_at)#>>'{}' AS started_at, to_json(i.finished_at)#>>'{}' AS finished_at,
           i.started_by, s.display_name AS started_by_name, i.counts
      FROM app.imports i LEFT JOIN app.staff s ON s.user_id = i.started_by
     ORDER BY i.started_at DESC
     LIMIT 30`.execute(trx);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    startedBy: row.started_by
      ? { userId: row.started_by, displayName: row.started_by_name ?? '' }
      : null,
    counts: row.counts,
  }));
};
