import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';

import { sql, type Transaction } from 'kysely';
import { createHash, randomBytes } from 'node:crypto';

import { type PersonSummary, summariesOf } from '../people/people.js';

/**
 * The census (onboarding spec §7, M2): its progress and the queue of personal links to send, the links themselves,
 * the option lists, and what the forms app may do, through the database's own functions.
 */

/** A personal link lasts this long; the database refuses more than 30 days. */
export const LINK_DAYS = 30;

export const makeCensusToken = (): string => randomBytes(32).toString('base64url');
export const hashCensusToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Where a person fills in their own census: the token in the fragment, which browsers send to no server. */
export const censusLink = (formsOrigin: string, token: string): string =>
  `${formsOrigin}/c#token=${encodeURIComponent(token)}`;

export interface LinkState {
  id: string;
  createdAt: string;
  expiresAt: string;
  sentAt: string | null;
  usedAt: string | null;
}

/** Censo: the counts, and the people whose profile isn't completed yet, with their latest link. */
export const censusProgress = async (trx: Transaction<DB>) => {
  const [counts] = (
    await sql<{ people: number; completed: number; links_sent: number; links_used: number }>`
      SELECT (SELECT count(*)::int FROM app.people p
               WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL
                 AND p.stage NOT IN ('left', 'discarded')) AS people,
             (SELECT count(*)::int FROM app.people p
               WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL AND p.profile_completed_at IS NOT NULL
                 AND p.stage NOT IN ('left', 'discarded')) AS completed,
             (SELECT count(DISTINCT person_id)::int FROM app.census_links WHERE sent_at IS NOT NULL) AS links_sent,
             (SELECT count(DISTINCT person_id)::int FROM app.census_links WHERE used_at IS NOT NULL) AS links_used`.execute(
      trx,
    )
  ).rows;
  const waiting = (
    await sql<{ id: string }>`
      SELECT p.id FROM app.people p
       WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL AND p.profile_completed_at IS NULL
         AND p.stage IN ('to_triage', 'new', 'contacting', 'talking', 'welcomed', 'active')
       ORDER BY p.created_at
       LIMIT 200`.execute(trx)
  ).rows.map((row) => row.id);
  const summaries = new Map((await summariesOf(trx, waiting)).map((person) => [person.id, person]));
  const links = (
    await sql<{
      person_id: string;
      id: string;
      created_at: string;
      expires_at: string;
      sent_at: string | null;
      used_at: string | null;
    }>`
      SELECT DISTINCT ON (person_id) person_id, id, to_json(created_at)#>>'{}' AS created_at,
             to_json(expires_at)#>>'{}' AS expires_at, to_json(sent_at)#>>'{}' AS sent_at,
             to_json(used_at)#>>'{}' AS used_at
        FROM app.census_links WHERE person_id = ANY (${waiting}::uuid[])
       ORDER BY person_id, created_at DESC`.execute(trx)
  ).rows;
  const linkOf = new Map(
    links.map((row): [string, LinkState] => [
      row.person_id,
      {
        id: row.id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        sentAt: row.sent_at,
        usedAt: row.used_at,
      },
    ]),
  );
  return {
    counts: {
      people: counts?.people ?? 0,
      completed: counts?.completed ?? 0,
      linksSent: counts?.links_sent ?? 0,
      linksUsed: counts?.links_used ?? 0,
    },
    queue: waiting.flatMap((id) => {
      const person: PersonSummary | undefined = summaries.get(id);
      return person ? [{ person, link: linkOf.get(id) ?? null }] : [];
    }),
  };
};

/** A new personal link for a person: its id and expiry (the token is the caller's, shown once). */
export const createCensusLink = async (
  trx: Transaction<DB>,
  person: string,
  token: string,
): Promise<{ id: string; expiresAt: string }> => {
  const { rows } = await sql<{ id: string; expires_at: string }>`
    INSERT INTO app.census_links (person_id, token_hash, expires_at)
    VALUES (${person}, ${hashCensusToken(token)}, now() + make_interval(days => ${LINK_DAYS}))
    RETURNING id, to_json(expires_at)#>>'{}' AS expires_at`.execute(trx);
  const [row] = rows;
  if (!row) {
    throw new Error('The new census link came back with no id');
  }
  return { id: row.id, expiresAt: row.expires_at };
};

/** "Enviado": marks a link sent, once, and logs it as a WhatsApp message left; the person's id, or undefined. */
export const markLinkSent = async (
  trx: Transaction<DB>,
  id: string,
): Promise<string | undefined> => {
  const { rows } = await sql<{ person_id: string }>`
    UPDATE app.census_links SET sent_at = now() WHERE id = ${id} AND sent_at IS NULL RETURNING person_id`.execute(
    trx,
  );
  const person = rows[0]?.person_id;
  if (person) {
    await sql`
      INSERT INTO app.person_events (person_id, kind, body, data)
      VALUES (${person}, 'contact_attempt', 'Enlace del censo', '{"channel": "whatsapp", "outcome": "left_message"}')`.execute(
      trx,
    );
  }
  return person;
};

export interface CensusOption {
  id: string;
  kind: 'skill' | 'interest';
  label: string;
  active: boolean;
  position: number;
}

export const listOptions = async (trx: Transaction<DB>): Promise<CensusOption[]> =>
  (
    await sql<CensusOption>`
      SELECT id, kind, label, active, position FROM app.census_options ORDER BY kind, position, label`.execute(
      trx,
    )
  ).rows;

export const addOption = async (
  trx: Transaction<DB>,
  option: { kind: 'skill' | 'interest'; label: string },
): Promise<string> => {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.census_options (kind, label, position)
    VALUES (${option.kind}, ${option.label},
            (SELECT coalesce(max(position), 0) + 1 FROM app.census_options WHERE kind = ${option.kind}))
    RETURNING id`.execute(trx);
  return rows[0]?.id ?? '';
};

export const changeOption = async (
  trx: Transaction<DB>,
  id: string,
  change: {
    label?: string | undefined;
    active?: boolean | undefined;
    position?: number | undefined;
  },
): Promise<boolean> => {
  const sets = [
    ...(change.label === undefined ? [] : [sql`label = ${change.label}`]),
    ...(change.active === undefined ? [] : [sql`active = ${change.active}`]),
    ...(change.position === undefined ? [] : [sql`position = ${change.position}`]),
  ];
  if (sets.length === 0) {
    return true;
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.census_options SET ${sql.join(sets)} WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1;
};

/**
 * A list's new order, all at once: the ids of every option of that kind, first to last. False when they aren't
 * exactly that list's (someone changed it meanwhile).
 */
export const orderOptions = async (
  trx: Transaction<DB>,
  kind: 'skill' | 'interest',
  ids: readonly string[],
): Promise<boolean> => {
  const current = (
    await sql<{ id: string }>`
      SELECT id FROM app.census_options WHERE kind = ${kind} ORDER BY id FOR UPDATE`.execute(trx)
  ).rows.map((row) => row.id);
  if (current.length !== ids.length || !ids.every((id) => current.includes(id))) {
    return false;
  }
  await sql`
    UPDATE app.census_options o SET position = t.n
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS t (id, n)
     WHERE o.id = t.id AND o.position IS DISTINCT FROM t.n`.execute(trx);
  return true;
};

export interface ConsentState {
  granted: boolean;
  at: string;
  wordingVersion: string;
}

/** A person's census side, for their page: options, the "other" answers, the latest consent of each kind. */
export const censusOfPerson = async (trx: Transaction<DB>, person: string) => {
  const options = (
    await sql<{ id: string; kind: 'skill' | 'interest'; label: string }>`
      SELECT o.id, o.kind, o.label FROM app.person_options po JOIN app.census_options o ON o.id = po.option_id
       WHERE po.person_id = ${person} ORDER BY o.kind, o.position, o.label`.execute(trx)
  ).rows;
  const [others] = (
    await sql<{ skills_other: string | null; interests_other: string | null }>`
      SELECT skills_other, interests_other FROM app.people WHERE id = ${person}`.execute(trx)
  ).rows;
  const consents = (
    await sql<{
      kind: 'email' | 'whatsapp' | 'privacy';
      granted: boolean;
      at: string;
      wording_version: string;
    }>`
      SELECT DISTINCT ON (kind) kind, granted, to_json(created_at)#>>'{}' AS at, wording_version
        FROM app.consents WHERE person_id = ${person} ORDER BY kind, created_at DESC`.execute(trx)
  ).rows;
  const latest = (kind: 'email' | 'whatsapp' | 'privacy'): ConsentState | null => {
    const row = consents.find((consent) => consent.kind === kind);
    return row ? { granted: row.granted, at: row.at, wordingVersion: row.wording_version } : null;
  };
  return {
    options,
    skillsOther: others?.skills_other ?? null,
    interestsOther: others?.interests_other ?? null,
    consents: { email: latest('email'), whatsapp: latest('whatsapp'), privacy: latest('privacy') },
  };
};

/**
 * Everything the backoffice holds about a person (personal data spec, rights: access and portability), recorded in
 * the exports. Admins only (the export's insert policy); never the links' token hashes.
 */
export const exportPerson = async (
  trx: Transaction<DB>,
  person: string,
): Promise<Record<string, unknown> | undefined> => {
  const one = async (query: ReturnType<typeof sql>) => (await query.execute(trx)).rows;
  // The person and every duplicate merged into them, at any depth: what they hold is theirs too.
  const chain = (
    await sql<{ id: string }>`
      WITH RECURSIVE up (id, merged_into) AS (
        SELECT p.id, p.merged_into FROM app.people p WHERE p.id = ${person}
        UNION
        SELECT p.id, p.merged_into FROM app.people p JOIN up u ON p.id = u.merged_into),
      merged (id, depth) AS (
        SELECT u.id, 0 FROM up u WHERE u.merged_into IS NULL
        UNION
        SELECT p.id, m.depth + 1 FROM app.people p JOIN merged m ON p.merged_into = m.id)
      SELECT id FROM merged ORDER BY depth, id`.execute(trx)
  ).rows.map((row) => row.id);
  const [survivor, ...merged] = chain;
  const profileOf = (id: string) => sql`
    SELECT id, full_name, preferred_name, province, town, languages, pronouns, availability, how_heard, skills_other,
           interests_other, stage, owner_id, next_action, next_action_due, profile_completed_at, merged_into,
           anonymised_at, created_at, updated_at
      FROM app.people WHERE id = ${id}`;
  const [profile] = survivor ? await one(profileOf(survivor)) : [];
  if (!profile) {
    return undefined;
  }
  const data = {
    exportedAt: new Date().toISOString(),
    person: profile,
    mergedRecords: (
      await Promise.all(merged.map(async (id) => (await one(profileOf(id)))[0]))
    ).filter(Boolean),
    identities: await one(sql`SELECT kind, value, verified, source, created_at FROM app.identities
                               WHERE person_id = ANY (${chain}::uuid[]) ORDER BY created_at`),
    sources: await one(sql`SELECT source, first_seen_at FROM app.person_sources
                            WHERE person_id = ANY (${chain}::uuid[]) ORDER BY first_seen_at`),
    communityPresence: await one(sql`SELECT joined_on, left_on, chat FROM app.community_presence
                                      WHERE person_id = ANY (${chain}::uuid[]) ORDER BY created_at`),
    options: await one(sql`SELECT DISTINCT o.kind, o.label FROM app.person_options po
                             JOIN app.census_options o ON o.id = po.option_id
                            WHERE po.person_id = ANY (${chain}::uuid[])`),
    consents:
      await one(sql`SELECT kind, granted, wording_version, source, given_at, created_at FROM app.consents
                             WHERE person_id = ANY (${chain}::uuid[]) ORDER BY given_at`),
    timeline: await one(sql`SELECT kind, created_at, channel, body, data FROM app.person_events
                             WHERE person_id = ANY (${chain}::uuid[]) ORDER BY created_at`),
    intakeRecords: await one(sql`SELECT source, status, payload, created_at FROM app.intake_records
                                  WHERE person_id = ANY (${chain}::uuid[]) ORDER BY created_at`),
    censusLinks: await one(sql`SELECT created_at, expires_at, sent_at, used_at FROM app.census_links
                                WHERE person_id = ANY (${chain}::uuid[]) ORDER BY created_at`),
  };
  await sql`INSERT INTO app.exports (kind, filter, row_count)
            VALUES ('person_json', ${JSON.stringify({ person: survivor })}::jsonb, 1)`.execute(trx);
  return data;
};

/** Erasure: the database's anonymisation (admins only). Whether it did (false: already anonymised, or no such one). */
export const erasePerson = async (trx: Transaction<DB>, person: string): Promise<boolean> =>
  (await sql<{ done: boolean }>`SELECT private.anonymise_person(${person}) AS done`.execute(trx))
    .rows[0]?.done === true;

// The forms app's side: the public role, without an actor ---------------------------------------------------------

export interface CensusForm {
  options: { id: string; kind: 'skill' | 'interest'; label: string }[];
  greeting: string | null;
  link: 'generic' | 'personal' | 'invalid';
}

export const censusForm = async (db: Database, token: string | undefined): Promise<CensusForm> => {
  const { rows } = await sql<CensusForm>`
    SELECT options, greeting, link FROM private.census_form(${token ? hashCensusToken(token) : null})`.execute(
    db,
  );
  return rows[0] ?? { options: [], greeting: null, link: token ? 'invalid' : 'generic' };
};

export const submitCensus = async (
  db: Database,
  token: string | undefined,
  answer: Record<string, unknown>,
): Promise<'created' | 'updated' | 'review' | 'invalid'> => {
  const { rows } = await sql<{ outcome: 'created' | 'updated' | 'review' | 'invalid' }>`
    SELECT private.submit_census(${token ? hashCensusToken(token) : null}, ${JSON.stringify(answer)}::jsonb)
             AS outcome`.execute(db);
  return rows[0]?.outcome ?? 'invalid';
};
