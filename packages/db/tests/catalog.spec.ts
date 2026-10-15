import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { BOT_POLICIES, EXECUTE_ALLOWLIST, SECURITY_DEFINER_ALLOWLIST } from './allowlists.js';
import { inRolledBackTransaction, RUNTIME_ROLES } from './db.js';

const rows = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  inRolledBackTransaction(async (client) => (await client.query(sql, params)).rows as T[]);

const SCHEMAS = ['app', 'private', 'auth'];
const TABLE_PRIVILEGES = `ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']`;

/** Everything `role` can reach in `schemas`: tables and columns, sequences, functions, the schemas themselves. */
const reachable = async (role: string, schemas: readonly string[]): Promise<string[]> =>
  (
    await rows<{ grant: string }>(
      `SELECT n.nspname || '.' || c.relname || ' ' || p.privilege AS grant
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN unnest(${TABLE_PRIVILEGES}) AS p(privilege)
        WHERE n.nspname = ANY($2) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (has_table_privilege($1, c.oid, p.privilege)
               OR (p.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                   AND has_any_column_privilege($1, c.oid, p.privilege)))
       UNION ALL
       SELECT n.nspname || '.' || c.relname || ' ' || p.privilege
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) AS p(privilege)
        WHERE n.nspname = ANY($2) AND c.relkind = 'S'
          AND has_sequence_privilege($1, c.oid, p.privilege)
       UNION ALL
       SELECT n.nspname || '.' || f.proname || ' EXECUTE'
         FROM pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
        WHERE n.nspname = ANY($2) AND has_function_privilege($1, f.oid, 'EXECUTE')
       UNION ALL
       SELECT nspname || ' ' || p.privilege FROM pg_namespace CROSS JOIN unnest(ARRAY['USAGE', 'CREATE']) AS p(privilege)
        WHERE nspname = ANY($2) AND has_schema_privilege($1, oid, p.privilege)
        ORDER BY 1`,
      [role, schemas],
    )
  ).map((r) => r.grant);

describe('catalog: runtime roles', () => {
  it('exist and can never bypass RLS or manage roles and databases', async () => {
    const roles = await rows<{ rolname: string; risky: boolean }>(
      `SELECT rolname, (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication) AS risky
         FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`,
      [RUNTIME_ROLES],
    );
    expect(roles.map((r) => r.rolname)).toEqual([...RUNTIME_ROLES].sort());
    expect(roles.filter((r) => r.risky)).toEqual([]);
  });

  it('are every login role of the database but its owner, so none escapes these checks', async () => {
    const logins = await rows<{ rolname: string }>(
      `SELECT rolname FROM pg_roles
        WHERE rolcanlogin AND rolname LIKE 'pauseai\\_backoffice\\_%' AND rolname <> 'pauseai_backoffice_owner'
        ORDER BY rolname`,
    );
    expect(logins.map((r) => r.rolname)).toEqual([...RUNTIME_ROLES].sort());
  });

  it('are members of no role, so none can SET ROLE to one that reaches more (the owner, say)', async () => {
    const memberships = await rows<{ grant: string }>(
      `SELECT m.member::regrole::text || ' in ' || m.roleid::regrole::text AS grant
         FROM pg_auth_members m WHERE m.member::regrole::text = ANY($1)`,
      [RUNTIME_ROLES],
    );
    expect(memberships).toEqual([]);
  });

  it('own no schema, relation or function', async () => {
    const owned = await rows<{ kind: string; name: string }>(
      `SELECT 'schema' AS kind, nspname AS name FROM pg_namespace WHERE nspowner::regrole::text = ANY($1)
       UNION ALL
       SELECT 'relation', relname FROM pg_class WHERE relowner::regrole::text = ANY($1)
       UNION ALL
       SELECT 'function', proname FROM pg_proc WHERE proowner::regrole::text = ANY($1)`,
      [RUNTIME_ROLES],
    );
    expect(owned).toEqual([]);
  });
});

describe('catalog: closed by default', () => {
  it('lets no runtime role create in public or the database, or make temporary tables, which could shadow a name', async () => {
    const allowed = await rows<{ grant: string }>(
      `SELECT r.role || ' public CREATE' AS grant FROM unnest($1::text[]) AS r(role)
        WHERE has_schema_privilege(r.role, 'public', 'CREATE')
       UNION ALL
       SELECT r.role || ' TEMP' FROM unnest($1::text[]) AS r(role)
        WHERE has_database_privilege(r.role, current_database(), 'TEMP')
       UNION ALL
       SELECT r.role || ' CREATE' FROM unnest($1::text[]) AS r(role)
        WHERE has_database_privilege(r.role, current_database(), 'CREATE')`,
      [RUNTIME_ROLES],
    );
    expect(allowed).toEqual([]);
  });

  it('does not let PUBLIC connect to the database', async () => {
    const [row] = await rows<{ allowed: boolean }>(
      `SELECT has_database_privilege('public', current_database(), 'CONNECT') AS allowed`,
    );
    expect(row?.allowed).toBe(false);
  });

  it('does not let PUBLIC execute any function in app, private or auth', async () => {
    const open = await rows<{ fn: string }>(
      `SELECT n.nspname || '.' || p.proname AS fn
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY($1)
          AND (p.proacl IS NULL
               OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))`,
      [SCHEMAS],
    );
    expect(open).toEqual([]);
  });

  it('grants EXECUTE to runtime roles only as allowlisted', async () => {
    const granted = await rows<{ grant: string }>(
      `SELECT r.rolname || ' ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
              AS grant
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(p.proacl) a
         JOIN pg_roles r ON r.oid = a.grantee
        WHERE n.nspname = ANY($2) AND a.privilege_type = 'EXECUTE' AND r.rolname = ANY($1)
        ORDER BY 1`,
      [RUNTIME_ROLES, SCHEMAS],
    );
    expect(granted.map((g) => g.grant)).toEqual([...EXECUTE_ALLOWLIST].sort());
  });

  it('pins search_path to nothing on every function, and allows only allowlisted SECURITY DEFINER functions', async () => {
    // Empty, not merely set: a function pinned to `public` or `app` would still resolve a name another role created.
    const functions = await rows<{ fn: string; definer: boolean; pinned: boolean }>(
      `SELECT n.nspname || '.' || p.proname AS fn, p.prosecdef AS definer,
              coalesce(p.proconfig @> ARRAY['search_path=""']
                         AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                                          WHERE c LIKE 'search_path=%' AND c <> 'search_path=""'), false) AS pinned
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY($1)`,
      [SCHEMAS],
    );
    expect(functions.filter((f) => !f.pinned).map((f) => f.fn)).toEqual([]);
    expect(
      functions
        .filter((f) => f.definer)
        .map((f) => f.fn)
        .sort(),
    ).toEqual([...SECURITY_DEFINER_ALLOWLIST].sort());
  });

  it('names every catalog relation with its schema in SECURITY DEFINER functions, so no temporary view stands in', async () => {
    // With search_path = '', an unqualified relation is still looked up in pg_temp first: a caller's own view there
    // would run as the function's owner.
    const definers = await rows<{ fn: string; body: string }>(
      `SELECT n.nspname || '.' || p.proname AS fn, p.prosrc AS body
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY($1) AND p.prosecdef`,
      [SCHEMAS],
    );
    const unqualified = definers.filter(({ body }) =>
      /\b(?:from|join)\s+(?!pg_catalog\.)pg_[a-z_]+\b(?!\s*\()/iu.test(body),
    );
    expect(unqualified.map(({ fn }) => fn)).toEqual([]);
  });

  it("keeps pauseai_backoffice_auth out of app and private: Better Auth's role reaches only auth", async () => {
    expect(await reachable('pauseai_backoffice_auth', ['app', 'private'])).toEqual([]);
  });

  it('keeps every other runtime role, and PUBLIC, out of auth', async () => {
    for (const role of [
      'public',
      ...RUNTIME_ROLES.filter((r) => r !== 'pauseai_backoffice_auth'),
    ]) {
      expect({ role, grants: await reachable(role, ['auth']) }).toEqual({ role, grants: [] });
    }
  });

  it('keeps the ingest role to its one function (ADR-0005), and gives the public role nothing until M2', async () => {
    expect(await reachable('pauseai_backoffice_ingest', SCHEMAS)).toEqual([
      'private USAGE',
      'private.ingest_airtable EXECUTE',
    ]);
    expect(await reachable('pauseai_backoffice_public', SCHEMAS)).toEqual([]);
  });

  it("lets only the app role look in the extensions schema, which holds pg_trgm's functions and nothing else", async () => {
    // A trusted extension's functions belong to the bootstrap superuser, executable by PUBLIC (migration
    // onboarding_types): the schema is what's closed.
    const users = await rows<{ role: string }>(
      `SELECT r.role FROM unnest($1::text[]) AS r(role) WHERE has_schema_privilege(r.role, 'extensions', 'USAGE')
       UNION ALL SELECT 'public' WHERE has_schema_privilege('public', 'extensions', 'USAGE')`,
      [RUNTIME_ROLES],
    );
    expect(users.map((u) => u.role)).toEqual(['pauseai_backoffice_app']);
    const foreign = await rows<{ name: string }>(
      `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'extensions'
       UNION ALL
       SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'extensions'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_extension e ON e.oid = d.refobjid
                           WHERE d.objid = p.oid AND d.deptype = 'e' AND e.extname = 'pg_trgm')`,
    );
    expect(foreign).toEqual([]);
  });

  it('gives pauseai_backoffice_auth exactly what Better Auth does with its tables, and no default grants anywhere', async () => {
    const granted = await rows<{ grant: string }>(
      `SELECT c.relname || ' ' || string_agg(p.privilege, ',' ORDER BY p.privilege) AS grant
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN unnest(${TABLE_PRIVILEGES}) AS p(privilege)
        WHERE n.nspname = 'auth' AND c.relkind IN ('r', 'p')
          AND has_table_privilege('pauseai_backoffice_auth', c.oid, p.privilege)
        GROUP BY c.relname ORDER BY 1`,
    );
    expect(granted.map((g) => g.grant)).toEqual([
      ...['accounts', 'rate_limits', 'sessions'].map(
        (table) => `${table} DELETE,INSERT,SELECT,UPDATE`,
      ),
      // The bot's links and their codes (ADR-0004): a link is replaced, never edited; a code is only marked used.
      'telegram_link_codes DELETE,INSERT,SELECT',
      'telegram_links DELETE,INSERT,SELECT',
      ...['two_factors', 'users', 'verifications'].map(
        (table) => `${table} DELETE,INSERT,SELECT,UPDATE`,
      ),
    ]);
    expect(
      await rows<{ column: string }>(
        `SELECT a.attname AS column FROM pg_attribute a
          WHERE a.attrelid = 'auth.telegram_link_codes'::regclass AND a.attnum > 0 AND NOT a.attisdropped
            AND has_column_privilege('pauseai_backoffice_auth', a.attrelid, a.attnum, 'UPDATE')
          ORDER BY 1`,
      ),
    ).toEqual([{ column: 'used_at' }]);
    const [schema] = await rows<{ create: boolean }>(
      `SELECT has_schema_privilege('pauseai_backoffice_auth', 'auth', 'CREATE') AS create`,
    );
    expect(schema?.create).toBe(false);
    // A default privilege for anyone but the owner would hand them every future table or function.
    expect(
      await rows(
        `SELECT d.defaclrole::regrole::text AS creator, d.defaclobjtype AS kind, x.grantee::regrole::text AS grantee
           FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) x
          WHERE x.grantee <> d.defaclrole`,
      ),
    ).toEqual([]);
  });

  it('never grants TRUNCATE (which skips RLS), REFERENCES, TRIGGER or MAINTAIN to a runtime role', async () => {
    const risky = await rows<{ grant: string }>(
      `SELECT r.role || ' ' || c.relname || ' ' || p.privilege AS grant
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN unnest($1::text[]) AS r(role)
         CROSS JOIN unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) AS p(privilege)
        WHERE n.nspname IN ('app', 'auth', 'private') AND c.relkind IN ('r', 'p', 'v')
          AND (has_table_privilege(r.role, c.oid, p.privilege)
               OR (p.privilege = 'REFERENCES' AND has_any_column_privilege(r.role, c.oid, p.privilege)))`,
      [RUNTIME_ROLES],
    );
    expect(risky).toEqual([]);
  });

  it('grants PUBLIC nothing on any table or column', async () => {
    const open = await rows<{ relname: string }>(
      `SELECT DISTINCT c.relname
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
        WHERE n.nspname = ANY($1)
          AND (EXISTS (SELECT 1 FROM aclexplode(c.relacl) x WHERE x.grantee = 0)
               OR EXISTS (SELECT 1 FROM aclexplode(a.attacl) x WHERE x.grantee = 0))`,
      [SCHEMAS],
    );
    expect(open).toEqual([]);
  });
});

/** Every policy in app that admits anyone without private.staff_can or private.bot_can, or applies to PUBLIC. */
const looseAndBotPolicies = async (
  client: pg.Client,
): Promise<{ loose: string[]; bot: string[] }> => {
  const policies = (
    await client.query<{ policy: string; roles: string[]; rule: string }>(
      `SELECT tablename || ' ' || policyname AS policy, roles::text[] AS roles,
              coalesce(qual, '') || ' ' || coalesce(with_check, '') AS rule
         FROM pg_policies WHERE schemaname = 'app' ORDER BY 1`,
    )
  ).rows;
  return {
    loose: policies
      .filter(
        ({ roles, rule }) =>
          roles.join(',') !== 'pauseai_backoffice_app' ||
          !/private\.(?:staff|bot)_can\(/u.test(rule),
      )
      .map(({ policy }) => policy),
    bot: policies
      .filter(({ rule }) => rule.includes('private.bot_can('))
      .map(({ policy }) => policy),
  };
};

describe('catalog: policies', () => {
  it('admit only the app role, and only through staff_can or bot_can (ADR-0002)', async () => {
    expect((await inRolledBackTransaction(looseAndBotPolicies)).loose).toEqual([]);
  });

  it('admit the bot only where listed on purpose (ADR-0004)', async () => {
    expect((await inRolledBackTransaction(looseAndBotPolicies)).bot).toEqual([...BOT_POLICIES]);
  });

  it('report a policy open to everyone, one for PUBLIC, and one that admits the bot', async () => {
    const found = await inRolledBackTransaction(async (client) => {
      await client.query(`
        CREATE TABLE app.probe (id int PRIMARY KEY);
        CREATE POLICY open_read ON app.probe FOR SELECT TO pauseai_backoffice_app USING (true);
        CREATE POLICY public_read ON app.probe FOR SELECT USING ((SELECT private.staff_can('admin')));
        CREATE POLICY bot_read ON app.probe FOR SELECT TO pauseai_backoffice_app
          USING ((SELECT private.bot_can('onboarding')));`);
      return looseAndBotPolicies(client);
    });
    expect(found.loose).toEqual(['probe open_read', 'probe public_read']);
    expect(found.bot).toEqual(['probe bot_read']);
  });
});

/** Actor columns and event timestamps set when a row is inserted (data model spec, conventions). */
const STAMPED_ON_INSERT = ['created_by', 'actor_id', 'created_at'];
/** Set on every insert and update. Columns set on a later transition are covered by the data-rule tests. */
const STAMPED_ALWAYS = ['updated_by', 'updated_at'];
/** `table.column` pairs that look stamped but are set elsewhere, and why. */
const NOT_STAMPED: Readonly<Record<string, string>> = {};

const ROW = 1;
const BEFORE = 2;
const INSERT = 4;
const DELETE = 8;
const UPDATE = 16;
const TRUNCATE = 32;

/** Every `table.column` in app that should be stamped by a BEFORE ROW `private.stamp` trigger but isn't. */
const missingStamps = async (client: pg.Client): Promise<string[]> => {
  const columns = (
    await client.query<{ name: string; col: string }>(
      `SELECT c.relname AS name, a.attname AS col
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attname = ANY($1)
        ORDER BY 1, 2`,
      [[...STAMPED_ON_INSERT, ...STAMPED_ALWAYS]],
    )
  ).rows;
  const triggers = (
    await client.query<{ name: string; type: number; args: Buffer }>(
      `SELECT c.relname AS name, t.tgtype AS type, t.tgargs AS args
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND NOT t.tgisinternal AND t.tgfoid = to_regprocedure('private.stamp()')`,
    )
  ).rows.map((t) => ({ ...t, args: t.args.toString('utf8').split('\0').filter(Boolean) }));

  return columns
    .filter(({ name, col }) => !(`${name}.${col}` in NOT_STAMPED))
    .filter(({ name, col }) => {
      const events = INSERT | (STAMPED_ALWAYS.includes(col) ? UPDATE : 0);
      return !triggers.some(
        (t) =>
          t.name === name &&
          t.args.includes(col) &&
          (t.type & (ROW | BEFORE)) === (ROW | BEFORE) &&
          (t.type & events) === events,
      );
    })
    .map(({ name, col }) => `${name}.${col}`);
};

describe('catalog: actor columns and event timestamps', () => {
  it('are all set by a private.stamp trigger', async () => {
    expect(await inRolledBackTransaction(missingStamps)).toEqual([]);
  });

  it('are reported when a table forgets the trigger, or stamps updated_by on insert only', async () => {
    const missing = await inRolledBackTransaction(async (client) => {
      await client.query(`
        CREATE TABLE app.unstamped (id int PRIMARY KEY, created_by uuid);
        CREATE TABLE app.half_stamped (id int PRIMARY KEY, created_at timestamptz, updated_by uuid);
        CREATE TRIGGER stamp BEFORE INSERT ON app.half_stamped
          FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at', 'updated_by');
        CREATE TABLE app.stamped (id int PRIMARY KEY, created_by uuid, updated_at timestamptz);
        CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.stamped
          FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'updated_at');`);
      return missingStamps(client);
    });
    expect(missing).toEqual(['half_stamped.updated_by', 'unstamped.created_by']);
  });
});

describe('catalog: tables', () => {
  it('enables RLS on every table in app', async () => {
    const unprotected = await rows<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity`,
    );
    expect(unprotected).toEqual([]);
  });

  it('has no materialized views, and only security_invoker views, in app', async () => {
    const offenders = await rows<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app'
          AND (c.relkind = 'm'
               OR (c.relkind = 'v' AND NOT coalesce('security_invoker=true' = ANY(c.reloptions), false)))`,
    );
    expect(offenders).toEqual([]);
  });

  it("keeps in private only the bot's own state, with exactly the grants it uses, for the app role alone", async () => {
    // Internal tables, outside app and its policies (ADR-0004): nobody but the app role reaches them, and it only as
    // the bot's code needs.
    const relations = await rows<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'private' AND c.relkind IN ('r', 'p', 'v', 'm') ORDER BY 1`,
    );
    expect(relations.map((r) => r.relname)).toEqual(Object.keys(PRIVATE_TABLES).sort());
    for (const role of RUNTIME_ROLES) {
      const granted = (await reachable(role, ['private'])).filter(
        (grant) => grant.startsWith('private.telegram_') && !grant.endsWith(' EXECUTE'),
      );
      const expected =
        role === 'pauseai_backoffice_app'
          ? Object.entries(PRIVATE_TABLES).flatMap(([table, privileges]) =>
              privileges.map((privilege) => `private.${table} ${privilege}`),
            )
          : [];
      expect({ role, granted: granted.sort() }).toEqual({ role, granted: expected.sort() });
    }
  });
});

/**
 * The bot's internal state in `private` (ADR-0004) and what the app role may do to each, as `reachable` reports it:
 * a column-level grant (telegram_posts' message_id) counts as the privilege on the table.
 */
const PRIVATE_TABLES: Readonly<Record<string, readonly string[]>> = {
  telegram_dialogs: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  telegram_posts: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  telegram_updates: ['DELETE', 'INSERT', 'SELECT'],
};

/** Tables written without an audit trigger, and why. Every other table in app must have one. */
const NOT_AUDITED: Readonly<Record<string, string>> = {
  audit_log: 'the log itself',
};

/** Tables in app whose rows are never updated or deleted, except by anonymisation (data model spec). */
const APPEND_ONLY = ['audit_log', 'person_events'];

/** Columns commented `personal data` (data model spec, conventions), as `table.column`: never copied to the log. */
const PERSONAL_DATA: readonly string[] = [
  'community_presence.chat',
  'exports.filter',
  'identities.value',
  'intake_records.conflicts',
  'intake_records.payload',
  'invitations.email',
  'people.availability',
  'people.full_name',
  'people.how_heard',
  'people.languages',
  'people.name_folded',
  'people.next_action',
  'people.preferred_name',
  'people.pronouns',
  'people.province',
  'people.town',
  'person_events.body',
  'person_events.data',
  'staff.display_name',
];

/** Better Auth's, in `auth`: it has no audit trigger, but the marks still say what is. */
const AUTH_PERSONAL_DATA: readonly string[] = [
  'auth.rate_limits.key',
  'auth.sessions.ip_address',
  'auth.sessions.user_agent',
  'auth.telegram_links.telegram_user_id',
  'auth.users.email',
  'auth.users.image',
  'auth.users.name',
];

/** Every table in app without an AFTER ROW private.audit() trigger on insert, update and delete, unless listed. */
const unaudited = async (client: pg.Client): Promise<string[]> =>
  (
    await client.query<{ name: string }>(
      `SELECT c.relname AS name
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p')
          AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                           WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
                             AND t.tgfoid = to_regprocedure('private.audit()')
                             AND (t.tgtype & ${ROW | BEFORE}) = ${ROW}
                             AND (t.tgtype & ${INSERT | UPDATE | DELETE}) = ${INSERT | UPDATE | DELETE})
        ORDER BY 1`,
    )
  ).rows
    .map((r) => r.name)
    .filter((name) => !(name in NOT_AUDITED));

describe('catalog: audit', () => {
  it('audits every table but the listed ones', async () => {
    expect(await inRolledBackTransaction(unaudited)).toEqual([]);
  });

  it('reports a table without the trigger, or audited on some operations only', async () => {
    const missing = await inRolledBackTransaction(async (client) => {
      await client.query(`
        CREATE TABLE app.probe_silent (id int PRIMARY KEY);
        CREATE TABLE app.probe_partial (id int PRIMARY KEY);
        CREATE TRIGGER audit AFTER INSERT OR UPDATE ON app.probe_partial
          FOR EACH ROW EXECUTE FUNCTION private.audit();`);
      return unaudited(client);
    });
    expect(missing).toEqual(['probe_partial', 'probe_silent']);
  });

  it('marks exactly the personal-data columns of the spec', async () => {
    const marked = await rows<{ col: string }>(
      `SELECT CASE n.nspname WHEN 'app' THEN '' ELSE n.nspname || '.' END || c.relname || '.' || a.attname AS col
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
        WHERE n.nspname IN ('app', 'auth', 'private') AND d.description = 'personal data'
        ORDER BY 1`,
    );
    expect(marked.map((m) => m.col)).toEqual(
      [...PERSONAL_DATA, ...AUTH_PERSONAL_DATA, 'private.telegram_dialogs.state'].sort(),
    );
  });

  it('protects every append-only table with UPDATE, DELETE and TRUNCATE triggers', async () => {
    const triggers = await rows<{ name: string; type: number }>(
      `SELECT c.relname AS name, t.tgtype AS type
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND NOT t.tgisinternal
          AND t.tgfoid = to_regprocedure('private.forbid_mutation()') AND (t.tgtype & ${BEFORE}) = ${BEFORE}`,
    );
    const covers = (name: string, events: number, row: boolean): boolean =>
      triggers.some(
        (t) => t.name === name && (t.type & events) === events && ((t.type & ROW) === ROW) === row,
      );
    expect(
      APPEND_ONLY.filter(
        (name) => !covers(name, UPDATE | DELETE, true) || !covers(name, TRUNCATE, false),
      ),
    ).toEqual([]);
  });
});
