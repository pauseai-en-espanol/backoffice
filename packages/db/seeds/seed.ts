// Fictional demo data for a local database (`pnpm db:seed`): people in every stage, from every source, with notes,
// contact attempts, community presence, and something waiting in the Bandeja, so every view has something to show.
// Names and addresses are obviously made up (CLAUDE.md); no phone numbers. It refuses any database that isn't on this
// machine, and adds nothing to a database it already seeded. Run directly by Node (type stripping), as the owner.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = fileURLToPath(new URL('../../../', import.meta.url));
if (existsSync(`${root}.env`)) {
  process.loadEnvFile(`${root}.env`);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set: copy .env.example to .env');
  process.exit(1);
}
const { hostname } = new URL(url);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
  console.error('The seeds are for a database on this machine only: refusing');
  process.exit(1);
}

/** A fixed id marks the seeded database, so a second run adds nothing. */
const MARKER = '0190f8c4-5eed-7000-8000-000000000001';

const STAGES = [
  'to_triage',
  'new',
  'new',
  'new',
  'contacting',
  'contacting',
  'talking',
  'welcomed',
  'active',
  'active',
  'dormant',
  'unresponsive',
  'left',
  'discarded',
] as const;
const FIRST = [
  'Alba',
  'Bruno',
  'Carmen',
  'Dario',
  'Elena',
  'Fermín',
  'Greta',
  'Hugo',
  'Iria',
  'Jaime',
  'Kira',
  'Luca',
];
const LAST = ['Ejemplo', 'Prueba', 'Ficticia', 'Muestra', 'Demo', 'Inventada'];
const PROVINCES = ['Provincia Norte', 'Provincia Sur', 'Provincia Este', 'Provincia Oeste', null];
const SOURCES = ['airtable', 'telegram', 'manual', 'csv'] as const;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const seeded = await client.query('SELECT 1 FROM app.people WHERE id = $1', [MARKER]);
  if (seeded.rows.length > 0) {
    console.log('Already seeded: nothing added (pnpm db:reset starts again)');
  } else {
    await client.query('BEGIN');
    await client.query(
      `UPDATE app.settings SET community_chats = '{"Chat general","Chat Norte","Chat Sur"}'`,
    );
    for (let n = 0; n < 28; n += 1) {
      const stage = STAGES[n % STAGES.length] ?? 'new';
      const name = `${FIRST[n % FIRST.length]} ${LAST[n % LAST.length]} ${n + 1}`;
      const source = SOURCES[n % SOURCES.length] ?? 'manual';
      const province = PROVINCES[n % PROVINCES.length] ?? null;
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO app.people (id, full_name, stage, province, next_action, next_action_due)
         VALUES (coalesce($1::uuid, uuidv7()), $2, $3, $4, $5, $6) RETURNING id`,
        [
          n === 0 ? MARKER : null,
          name,
          stage,
          province,
          ['contacting', 'talking', 'welcomed'].includes(stage) ? 'Escribir para quedar' : null,
          stage === 'talking' ? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) : null,
        ],
      );
      const id = rows[0]?.id ?? '';
      const slug = name
        .toLowerCase()
        .replaceAll(' ', '.')
        .normalize('NFD')
        .replaceAll(/\p{M}/gu, '');
      await client.query(
        `INSERT INTO app.identities (person_id, kind, value, source) VALUES ($1, 'email', $2, $3)`,
        [id, `${slug}@ejemplo.test`, source],
      );
      await client.query(`INSERT INTO app.person_sources (person_id, source) VALUES ($1, $2)`, [
        id,
        source,
      ]);
      if (stage !== 'discarded') {
        await client.query(
          `INSERT INTO app.community_presence (person_id, joined_on, left_on, chat)
           VALUES ($1, current_date - $2::int, CASE WHEN $3 THEN current_date - 2 END, $4)`,
          [id, 10 + n, stage === 'left', n % 2 === 0 ? 'Chat general' : 'Chat Norte'],
        );
      }
      if (['contacting', 'talking', 'welcomed', 'active', 'unresponsive'].includes(stage)) {
        await client.query(
          `INSERT INTO app.person_events (person_id, kind, data)
           VALUES ($1, 'contact_attempt', '{"channel": "whatsapp", "outcome": "no_answer"}')`,
          [id],
        );
      }
      if (n % 3 === 0) {
        await client.query(
          `INSERT INTO app.person_events (person_id, kind, body) VALUES ($1, 'note', 'Nota de ejemplo: le interesa la divulgación')`,
          [id],
        );
      }
    }
    // A possible duplicate waiting in the Bandeja.
    await client.query(
      `INSERT INTO app.intake_records (source, external_id, payload, status, candidates)
       VALUES ('manual', 'semilla-duplicado', '{"name": "Alba Ejemplo", "province": "Provincia Norte"}', 'review',
               ARRAY[$1::uuid])`,
      [MARKER],
    );
    await client.query('COMMIT');
    console.log('Seeded 28 fictional people and one Bandeja item');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
