import type { DB } from '@backoffice/db/generated/db';
import type { AttentionReason, Stage } from '@backoffice/domain/stages';

import { normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import { type RawBuilder, sql, type Transaction } from 'kysely';

/**
 * Onboarding's reads and writes (onboarding spec; staff API spec, M1), in the staff member's `withActor` transaction:
 * RLS lets onboarding staff and admins through the staff app, and the database's triggers write the timeline. What
 * the bot may do goes through its own functions instead (ADR-0004).
 */

/** A person as lists show one: never their contact details. */
export interface PersonSummary {
  id: string;
  name: string;
  fullName: string;
  stage: Stage;
  owner: { userId: string; displayName: string } | null;
  province: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  reasons: AttentionReason[];
  inCommunity: boolean;
  sources: string[];
  createdAt: string;
}

interface SummaryRow {
  id: string;
  full_name: string;
  preferred_name: string | null;
  stage: Stage;
  owner_id: string | null;
  owner_name: string | null;
  province: string | null;
  next_action: string | null;
  next_action_due: string | null;
  reasons: AttentionReason[];
  in_community: boolean;
  sources: string[];
  created_at: string;
}

const SUMMARY_COLUMNS = sql`
  p.id, p.full_name, p.preferred_name, p.stage::text AS stage, p.owner_id, s.display_name AS owner_name, p.province,
  p.next_action, to_char(p.next_action_due, 'YYYY-MM-DD') AS next_action_due, coalesce(a.reasons, '{}') AS reasons,
  EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = p.id AND c.left_on IS NULL) AS in_community,
  ARRAY(SELECT ps.source::text FROM app.person_sources ps WHERE ps.person_id = p.id ORDER BY ps.first_seen_at)
    AS sources,
  to_json(p.created_at)#>>'{}' AS created_at`;

const SUMMARY_FROM = sql`
  app.people p
  LEFT JOIN app.people_attention a ON a.person_id = p.id
  LEFT JOIN app.staff s ON s.user_id = p.owner_id`;

const toSummary = (row: SummaryRow): PersonSummary => ({
  id: row.id,
  name: row.preferred_name ?? row.full_name,
  fullName: row.full_name,
  stage: row.stage,
  owner: row.owner_id ? { userId: row.owner_id, displayName: row.owner_name ?? '' } : null,
  province: row.province,
  nextAction: row.next_action,
  nextActionDue: row.next_action_due,
  reasons: row.reasons,
  inCommunity: row.in_community,
  sources: row.sources,
  createdAt: row.created_at,
});

export interface PeopleFilter {
  q?: string | undefined;
  stages?: Stage[] | undefined;
  /** `me`, `none`, or a staff member's id. */
  owner?: string | undefined;
  attention?: boolean | undefined;
  inCommunity?: boolean | undefined;
  source?: string | undefined;
  province?: string | undefined;
}

/** The conditions a filter adds, for the actor `me`. Names match folded and typo-tolerant; phones and emails exactly. */
const conditions = (filter: PeopleFilter, me: string): RawBuilder<unknown>[] => {
  const where: RawBuilder<unknown>[] = [sql`p.merged_into IS NULL AND p.anonymised_at IS NULL`];
  const q = filter.q?.trim();
  if (q) {
    const phone = normalizePhone(q);
    const email = normalizeEmail(q);
    where.push(sql`(p.name_folded LIKE '%' || private.fold_name(${q}) || '%'
                    OR extensions.similarity(p.name_folded, private.fold_name(${q})) >= 0.35
                    OR EXISTS (SELECT 1 FROM app.identities i WHERE i.person_id = p.id
                                AND i.value IN (${phone ?? ''}, ${email ?? ''})))`);
  }
  if (filter.stages && filter.stages.length > 0) {
    where.push(sql`p.stage::text IN (${sql.join(filter.stages)})`);
  }
  if (filter.owner === 'me') {
    where.push(sql`p.owner_id = ${me}`);
  } else if (filter.owner === 'none') {
    where.push(sql`p.owner_id IS NULL`);
  } else if (filter.owner) {
    where.push(sql`p.owner_id = ${filter.owner}`);
  }
  if (filter.attention) {
    where.push(sql`cardinality(a.reasons) > 0`);
  }
  if (filter.inCommunity !== undefined) {
    const open = sql`EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = p.id AND c.left_on IS NULL)`;
    where.push(filter.inCommunity ? open : sql`NOT ${open}`);
  }
  if (filter.source) {
    where.push(sql`EXISTS (SELECT 1 FROM app.person_sources ps WHERE ps.person_id = p.id
                            AND ps.source::text = ${filter.source})`);
  }
  if (filter.province?.trim()) {
    where.push(sql`private.fold_name(p.province) = private.fold_name(${filter.province})`);
  }
  return where;
};

/** A cursor over (created_at, id), newest first: opaque to the staff app. */
const readCursor = (cursor: string | undefined): { at: string; id: string } | undefined => {
  if (!cursor) {
    return undefined;
  }
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  return at && id && /^[0-9a-f-]{36}$/u.test(id) && !Number.isNaN(Date.parse(at))
    ? { at, id }
    : undefined;
};

const writeCursor = (row: { created_at: string; id: string }): string =>
  Buffer.from(`${row.created_at}|${row.id}`, 'utf8').toString('base64url');

/** Personas: the people a filter finds, newest first, a page at a time. */
export const listPeople = async (
  trx: Transaction<DB>,
  me: string,
  filter: PeopleFilter,
  { limit = 50, cursor }: { limit?: number; cursor?: string | undefined } = {},
): Promise<{ people: PersonSummary[]; next: string | null }> => {
  const where = conditions(filter, me);
  const after = readCursor(cursor);
  if (after) {
    where.push(sql`(p.created_at, p.id) < (${after.at}::timestamptz, ${after.id}::uuid)`);
  }
  const { rows } = await sql<SummaryRow>`
    SELECT ${SUMMARY_COLUMNS} FROM ${SUMMARY_FROM}
     WHERE ${sql.join(where, sql` AND `)}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ${limit + 1}`.execute(trx);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    people: page.map(toSummary),
    next: rows.length > limit && last ? writeCursor(last) : null,
  };
};

/** The summaries of these people, as RLS shows them; a tombstone has none (its survivor stands for it). */
export const summariesOf = async (
  trx: Transaction<DB>,
  ids: string[],
): Promise<PersonSummary[]> => {
  if (ids.length === 0) {
    return [];
  }
  const { rows } = await sql<SummaryRow>`
    SELECT ${SUMMARY_COLUMNS} FROM ${SUMMARY_FROM} WHERE p.id = ANY (${ids}::uuid[])`.execute(trx);
  return rows.map(toSummary);
};

/**
 * The Panel (onboarding spec, views; M4): people by stage; arrivals per week (Monday to Sunday, in Madrid) by the
 * source they first came from; how long the arrivals of those weeks waited for a first contact attempt; and who has
 * waited more than 48 hours with nobody on them. Counts only, but for the unassigned, who are named so someone can
 * take them. Anonymised people count where they were; merged duplicates don't.
 */
export const panel = async (trx: Transaction<DB>, weeks: number) => {
  const stages = Object.fromEntries(
    (
      await sql<{ stage: string; n: number }>`
        SELECT stage::text AS stage, count(*)::int AS n FROM app.people
         WHERE merged_into IS NULL GROUP BY 1`.execute(trx)
    ).rows.map((row) => [row.stage, row.n]),
  );
  const since = sql`(date_trunc('week', now() AT TIME ZONE 'Europe/Madrid') - make_interval(weeks => ${weeks - 1}))
                      AT TIME ZONE 'Europe/Madrid'`;
  const arrivals = (
    await sql<{ week: string; counts: Record<string, number> }>`
      WITH weeks AS (
        SELECT (date_trunc('week', now() AT TIME ZONE 'Europe/Madrid') - make_interval(weeks => g))::date AS week
          FROM generate_series(0, ${weeks - 1}) AS g),
      arrived AS (
        SELECT date_trunc('week', p.created_at AT TIME ZONE 'Europe/Madrid')::date AS week,
               coalesce((SELECT ps.source::text FROM app.person_sources ps WHERE ps.person_id = p.id
                          ORDER BY ps.first_seen_at LIMIT 1), 'manual') AS source
          FROM app.people p
         WHERE p.merged_into IS NULL AND p.created_at >= ${since}),
      tally AS (SELECT week, source, count(*)::int AS n FROM arrived GROUP BY 1, 2)
      SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
             coalesce(jsonb_object_agg(t.source, t.n) FILTER (WHERE t.source IS NOT NULL), '{}') AS counts
        FROM weeks w LEFT JOIN tally t ON t.week = w.week
       GROUP BY w.week ORDER BY w.week`.execute(trx)
  ).rows;
  const [waited] = (
    await sql<{
      arrived: number;
      contacted: number;
      median_hours: number | null;
      p90_hours: number | null;
    }>`
      WITH arrivals AS (
        SELECT p.created_at,
               (SELECT min(e.created_at) FROM app.person_events e
                 WHERE e.person_id = p.id AND e.kind = 'contact_attempt') AS first_contact
          FROM app.people p
         WHERE p.merged_into IS NULL AND p.created_at >= ${since})
      SELECT count(*)::int AS arrived, count(first_contact)::int AS contacted,
             (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_contact - created_at) / 3600)
                FROM arrivals WHERE first_contact IS NOT NULL) AS median_hours,
             (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM first_contact - created_at) / 3600)
                FROM arrivals WHERE first_contact IS NOT NULL) AS p90_hours
        FROM arrivals`.execute(trx)
  ).rows;
  const unassigned = await sql<SummaryRow & { total: number }>`
    SELECT ${SUMMARY_COLUMNS}, count(*) OVER ()::int AS total FROM ${SUMMARY_FROM}
     WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL AND p.stage = 'new' AND p.owner_id IS NULL
       AND p.created_at < now() - interval '48 hours'
     ORDER BY p.created_at
     LIMIT 50`.execute(trx);
  const hours = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10;
  return {
    weeks,
    stages,
    arrivals,
    firstContact: {
      arrived: waited?.arrived ?? 0,
      contacted: waited?.contacted ?? 0,
      medianHours: hours(waited?.median_hours),
      p90Hours: hours(waited?.p90_hours),
    },
    unassigned: {
      count: unassigned.rows[0]?.total ?? 0,
      people: unassigned.rows.map(toSummary),
    },
  };
};

/** Hoy: my people needing attention, the unassigned queue (oldest first), and the Bandeja's size. */
export const today = async (trx: Transaction<DB>, me: string) => {
  const mine = await sql<SummaryRow>`
    SELECT ${SUMMARY_COLUMNS} FROM ${SUMMARY_FROM}
     WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL AND p.owner_id = ${me}
       AND cardinality(a.reasons) > 0
     ORDER BY p.next_action_due NULLS LAST, p.created_at
     LIMIT 100`.execute(trx);
  const unassigned = await sql<SummaryRow>`
    SELECT ${SUMMARY_COLUMNS} FROM ${SUMMARY_FROM}
     WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL AND p.stage = 'new' AND p.owner_id IS NULL
     ORDER BY p.created_at
     LIMIT 100`.execute(trx);
  const [counts] = (
    await sql<{ mine: number; unassigned: number; bandeja: number }>`
      SELECT (SELECT count(*)::int FROM app.people p JOIN app.people_attention a ON a.person_id = p.id
               WHERE p.owner_id = ${me} AND cardinality(a.reasons) > 0) AS mine,
             (SELECT count(*)::int FROM app.people p
               WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL AND p.stage = 'new'
                 AND p.owner_id IS NULL) AS unassigned,
             (SELECT count(*)::int FROM app.intake_records i WHERE i.status IN ('review', 'conflict')) AS bandeja`.execute(
      trx,
    )
  ).rows;
  return {
    mine: mine.rows.map(toSummary),
    unassigned: unassigned.rows.map(toSummary),
    counts: counts ?? { mine: 0, unassigned: 0, bandeja: 0 },
  };
};

/** Embudo: each stage's count and its first 50 people, newest first. */
export const board = async (trx: Transaction<DB>, me: string, filter: PeopleFilter) => {
  const where = conditions({ ...filter, q: undefined, stages: undefined }, me);
  const { rows } = await sql<SummaryRow & { rank: number; total: number }>`
    SELECT * FROM (
      SELECT ${SUMMARY_COLUMNS},
             row_number() OVER (PARTITION BY p.stage ORDER BY p.created_at DESC, p.id DESC)::int AS rank,
             count(*) OVER (PARTITION BY p.stage)::int AS total
        FROM ${SUMMARY_FROM}
       WHERE ${sql.join(where, sql` AND `)}) ranked
     WHERE rank <= 50
     ORDER BY stage, rank`.execute(trx);
  const stages: Record<string, { count: number; people: PersonSummary[] }> = {};
  for (const row of rows) {
    const column = (stages[row.stage] ??= { count: row.total, people: [] });
    column.people.push(toSummary(row));
  }
  return { stages };
};

export interface TimelineEvent {
  id: string;
  kind: string;
  at: string;
  actor: { userId: string; displayName: string | null } | null;
  channel: 'web' | 'bot' | null;
  body: string | null;
  data: Record<string, unknown>;
}

/**
 * Persona: the profile, identities, presence, sources and timeline. A tombstone answers with its survivor, and
 * `mergedInto` set; the timeline is the survivor's and its tombstones' together. Undefined if RLS shows no such
 * person.
 */
export const getPerson = async (trx: Transaction<DB>, id: string) => {
  const found = await sql<{ id: string; merged_into: string | null }>`
    SELECT p.id, p.merged_into FROM app.people p WHERE p.id = ${id}`.execute(trx);
  const asked = found.rows[0];
  if (!asked) {
    return undefined;
  }
  let survivor = asked.id;
  for (let depth = 0, next = asked.merged_into; next && depth < 20; depth += 1) {
    survivor = next;
    next =
      (
        await sql<{
          merged_into: string | null;
        }>`SELECT merged_into FROM app.people WHERE id = ${next}`.execute(trx)
      ).rows[0]?.merged_into ?? null;
  }
  const summary = (
    await sql<SummaryRow>`SELECT ${SUMMARY_COLUMNS} FROM ${SUMMARY_FROM} WHERE p.id = ${survivor}`.execute(
      trx,
    )
  ).rows[0];
  if (!summary) {
    return undefined;
  }
  const profile = (
    await sql<{
      town: string | null;
      languages: string[];
      pronouns: string | null;
      availability: string | null;
      how_heard: string | null;
      profile_completed_at: string | null;
      anonymised_at: string | null;
    }>`
      SELECT town, languages, pronouns, availability::text AS availability, how_heard,
             to_json(profile_completed_at)#>>'{}' AS profile_completed_at,
             to_json(anonymised_at)#>>'{}' AS anonymised_at
        FROM app.people WHERE id = ${survivor}`.execute(trx)
  ).rows[0];
  const identities = (
    await sql<{ id: string; kind: string; value: string; verified: boolean; source: string }>`
      SELECT id, kind::text AS kind, value, verified, source::text AS source
        FROM app.identities WHERE person_id = ${survivor} ORDER BY kind, created_at`.execute(trx)
  ).rows;
  const presence = (
    await sql<{
      id: string;
      joined_on: string | null;
      left_on: string | null;
      chat: string | null;
    }>`
      SELECT id, to_char(joined_on, 'YYYY-MM-DD') AS joined_on, to_char(left_on, 'YYYY-MM-DD') AS left_on, chat
        FROM app.community_presence WHERE person_id = ${survivor}
       ORDER BY coalesce(joined_on, left_on) DESC NULLS LAST, created_at DESC`.execute(trx)
  ).rows;
  const sources = (
    await sql<{ source: string; first_seen_at: string; reported_by: string | null }>`
      SELECT source::text AS source, to_json(first_seen_at)#>>'{}' AS first_seen_at, reported_by
        FROM app.person_sources WHERE person_id = ${survivor} ORDER BY first_seen_at`.execute(trx)
  ).rows;
  const tombstones = (
    await sql<{ id: string }>`
      WITH RECURSIVE merged (id) AS (
        SELECT p.id FROM app.people p WHERE p.merged_into = ${survivor}
        UNION SELECT p.id FROM app.people p JOIN merged m ON p.merged_into = m.id)
      SELECT id FROM merged`.execute(trx)
  ).rows.map((row) => row.id);
  const timeline = (
    await sql<{
      id: string;
      kind: string;
      at: string;
      actor_id: string | null;
      actor_name: string | null;
      channel: 'web' | 'bot' | null;
      body: string | null;
      data: Record<string, unknown>;
    }>`
      SELECT e.id, e.kind::text AS kind, to_json(e.created_at)#>>'{}' AS at, e.actor_id, s.display_name AS actor_name,
             e.channel, e.body, e.data
        FROM app.person_events e LEFT JOIN app.staff s ON s.user_id = e.actor_id
       WHERE e.person_id = ANY (${[survivor, ...tombstones]}::uuid[])
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT 500`.execute(trx)
  ).rows.map((row): TimelineEvent => ({
    id: row.id,
    kind: row.kind,
    at: row.at,
    actor: row.actor_id ? { userId: row.actor_id, displayName: row.actor_name } : null,
    channel: row.channel,
    body: row.body,
    data: row.data,
  }));
  const phone = identities.find((identity) => identity.kind === 'phone')?.value;
  return {
    person: {
      ...toSummary(summary),
      preferredName: summary.preferred_name,
      town: profile?.town ?? null,
      languages: profile?.languages ?? [],
      pronouns: profile?.pronouns ?? null,
      availability: profile?.availability ?? null,
      howHeard: profile?.how_heard ?? null,
      profileCompletedAt: profile?.profile_completed_at ?? null,
      anonymisedAt: profile?.anonymised_at ?? null,
      mergedInto: survivor === asked.id ? null : survivor,
      identities,
      presence: presence.map((row) => ({
        id: row.id,
        joinedOn: row.joined_on,
        leftOn: row.left_on,
        chat: row.chat,
      })),
      sources: sources.map((row) => ({
        source: row.source,
        firstSeenAt: row.first_seen_at,
        reportedBy: row.reported_by,
      })),
      phone: phone ?? null,
    },
    timeline,
    tombstones,
  };
};

/** The profile fields staff edit, as the API names them, and their columns. */
export const PROFILE_FIELDS = {
  fullName: 'full_name',
  preferredName: 'preferred_name',
  province: 'province',
  town: 'town',
  languages: 'languages',
  pronouns: 'pronouns',
  availability: 'availability',
  howHeard: 'how_heard',
  stage: 'stage',
  ownerId: 'owner_id',
  nextAction: 'next_action',
  nextActionDue: 'next_action_due',
} as const;

export type PersonChange = Partial<Record<keyof typeof PROFILE_FIELDS, unknown>>;

/** Changes a person; false if RLS shows none that may change (a tombstone, someone gone). */
export const updatePerson = async (
  trx: Transaction<DB>,
  id: string,
  change: PersonChange,
): Promise<boolean> => {
  const sets = Object.entries(change)
    .filter(([key]) => key in PROFILE_FIELDS)
    .map(([key, value]) => {
      const column = PROFILE_FIELDS[key as keyof typeof PROFILE_FIELDS];
      const text = typeof value === 'string' ? value.trim() : value;
      const cleared = text === '' ? null : text;
      if (column === 'stage') {
        return sql`stage = ${cleared}::app.stage`;
      }
      if (column === 'availability') {
        return sql`availability = ${cleared}::app.availability`;
      }
      if (column === 'next_action_due') {
        return sql`next_action_due = ${cleared}::date`;
      }
      if (column === 'languages') {
        return sql`languages = ${cleared ?? []}::text[]`;
      }
      return sql`${sql.ref(column)} = ${cleared}`;
    });
  if (sets.length === 0) {
    return true;
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.people SET ${sql.join(sets)} WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1;
};

/** Me lo quedo, through the database's own function (the bot uses it too): whether the actor got them. */
export const claimPerson = async (trx: Transaction<DB>, id: string): Promise<boolean> =>
  (await sql<{ done: boolean }>`SELECT private.claim_person(${id}) AS done`.execute(trx)).rows[0]
    ?.done === true;

export const addNote = async (trx: Transaction<DB>, id: string, body: string): Promise<void> => {
  await sql`INSERT INTO app.person_events (person_id, kind, body) VALUES (${id}, 'note', ${body})`.execute(
    trx,
  );
};

export const addAttempt = async (
  trx: Transaction<DB>,
  id: string,
  attempt: { channel: string; outcome: string; note?: string | undefined },
): Promise<void> => {
  await sql`
    INSERT INTO app.person_events (person_id, kind, body, data)
    VALUES (${id}, 'contact_attempt', ${attempt.note?.trim() || null},
            ${JSON.stringify({ channel: attempt.channel, outcome: attempt.outcome })}::jsonb)`.execute(
    trx,
  );
};

export type AddIdentityResult = { id: string } | { taken: string | null } | 'invalid';

/** Adds an email or phone, normalised; refused if someone else holds it. */
export const addIdentity = async (
  trx: Transaction<DB>,
  person: string,
  kind: 'email' | 'phone',
  raw: string,
): Promise<AddIdentityResult> => {
  const value = kind === 'email' ? normalizeEmail(raw) : normalizePhone(raw);
  if (!value) {
    return 'invalid';
  }
  const holder = (
    await sql<{ person_id: string }>`
      SELECT person_id FROM app.identities WHERE kind = ${kind}::app.identity_kind AND value = ${value}`.execute(
      trx,
    )
  ).rows[0];
  if (holder) {
    return { taken: holder.person_id === person ? null : holder.person_id };
  }
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.identities (person_id, kind, value, source)
    VALUES (${person}, ${kind}::app.identity_kind, ${value}, 'manual') RETURNING id`.execute(trx);
  return { id: rows[0]?.id ?? '' };
};

export const removeIdentity = async (
  trx: Transaction<DB>,
  person: string,
  identity: string,
): Promise<boolean> =>
  (
    await sql<{ id: string }>`
      DELETE FROM app.identities WHERE id = ${identity} AND person_id = ${person} RETURNING id`.execute(
      trx,
    )
  ).rows.length === 1;

/** Someone joined (again): a new open period, unless one is open. Its timeline event comes from the database. */
export const recordJoin = async (
  trx: Transaction<DB>,
  person: string,
  me: string,
  { joinedOn, chat }: { joinedOn?: string | undefined; chat?: string | undefined },
): Promise<boolean> => {
  const open =
    await sql`SELECT 1 FROM app.community_presence WHERE person_id = ${person} AND left_on IS NULL`.execute(
      trx,
    );
  if (open.rows.length > 0) {
    return false;
  }
  await sql`
    INSERT INTO app.community_presence (person_id, joined_on, chat, joined_reported_by)
    VALUES (${person}, coalesce(${joinedOn ?? null}::date, (now() AT TIME ZONE 'Europe/Madrid')::date),
            ${chat?.trim() || null}, ${me})`.execute(trx);
  return true;
};

/** Someone left: the database's own function (the bot uses it too). */
export const recordLeave = async (
  trx: Transaction<DB>,
  person: string,
  leftOn: string | undefined,
): Promise<boolean> =>
  (
    await sql<{
      done: boolean;
    }>`SELECT private.report_leave(${person}, ${leftOn ?? null}::date) AS done`.execute(trx)
  ).rows[0]?.done === true;

export const mergePeople = async (
  trx: Transaction<DB>,
  survivor: string,
  merged: string,
): Promise<void> => {
  await sql`SELECT private.merge_people(${survivor}, ${merged})`.execute(trx);
};
