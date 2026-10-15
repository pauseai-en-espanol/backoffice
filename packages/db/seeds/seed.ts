// Fictional demo data for a local database (`pnpm db:seed`): people in every stage, from every source, with notes,
// contact attempts, community presence, and something waiting in the Bandeja; and an outreach campaign with its
// organisations, contacts, templates and anchors, so every view has something to show.
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

const OUTREACH_SLUG = 'campana-de-ejemplo';

/** Outreach (M3): organisations, contacts of every kind (a person, an inbox, one to review, one held), a campaign. */
const seedOutreach = async (db: pg.Client): Promise<void> => {
  const organisations: [string, string, string][] = [
    ['Sindicato Ejemplo', 'union', 'Aragón'],
    ['Partido Ficticio', 'party', 'Estatal'],
    ['Universidad de Muestra', 'university', 'Provincia Norte'],
    ['Diario Inventado', 'media', 'Estatal'],
  ];
  const orgIds: string[] = [];
  for (const [name, kind, territory] of organisations) {
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO app.organisations (name, kind, territory) VALUES ($1, $2, $3) RETURNING id',
      [name, kind, territory],
    );
    orgIds.push(rows[0]?.id ?? '');
  }
  const { rows: campaignRows } = await db.query<{ id: string }>(
    `INSERT INTO app.campaigns (slug, name, goal, from_name, from_email, signature, status)
     VALUES ($1, 'Campaña de ejemplo', 'Presentar la campaña a organizaciones de ejemplo', 'Equipo de ejemplo',
             'equipo@ejemplo.test', E'Un saludo,\nEquipo de ejemplo', 'active') RETURNING id`,
    [OUTREACH_SLUG],
  );
  const campaignId = campaignRows[0]?.id ?? '';
  await db.query(
    `INSERT INTO app.campaign_templates (campaign_id, tier, subject, body, max_words, sources)
     VALUES ($1, 'A', 'Una propuesta para {{org}}',
             E'{{saludo}}\n\nOs escribimos desde un equipo de ejemplo.\n\n{{anchor}}\n\n{{firma}}', 250,
             '{https://ejemplo.test/carta-larga}'),
            ($1, 'B', 'Hola, {{org}}', E'{{saludo}}\n\n{{anchor}}\n\n{{firma}}', 150, '{}')`,
    [campaignId],
  );
  await db.query(
    `INSERT INTO app.campaign_anchors (campaign_id, key, label, text, sources)
     VALUES ($1, 'empleo', 'Empleo', 'Un párrafo de ejemplo con una cifra inventada: el 42 % de algo.',
             '{https://ejemplo.test/cifra-empleo}'),
            ($1, 'prensa', 'Prensa', 'Un párrafo de ejemplo pensado para medios.', '{https://ejemplo.test/prensa}')`,
    [campaignId],
  );
  const contacts: {
    org: number;
    display: string;
    person?: string;
    role?: string;
    tier: 'A' | 'B';
    anchor: string;
    status?: string;
    priority?: number;
    review?: boolean;
    hold?: boolean;
  }[] = [
    {
      org: 0,
      display: 'Sindicato Ejemplo — Aragón',
      person: 'Berta Ejemplo',
      role: 'Secretaría general',
      tier: 'A',
      anchor: 'empleo',
      priority: 1,
    },
    { org: 0, display: 'Sindicato Ejemplo — Aragón', tier: 'B', anchor: 'empleo', status: 'sent' },
    { org: 0, display: 'Sindicato Ejemplo — Sección de Fábrica', tier: 'B', anchor: 'empleo' },
    {
      org: 1,
      display: 'Partido Ficticio',
      person: 'Carlos Muestra',
      role: 'Portavoz',
      tier: 'A',
      anchor: 'empleo',
      status: 'replied',
    },
    {
      org: 1,
      display: 'Partido Ficticio',
      person: 'Dana Prueba',
      role: 'Diputación',
      tier: 'A',
      anchor: 'empleo',
      priority: 2,
    },
    {
      org: 2,
      display: 'Universidad de Muestra',
      person: 'Eva Inventada',
      role: 'Cátedra de ética',
      tier: 'B',
      anchor: 'empleo',
      status: 'meeting',
    },
    { org: 2, display: 'Universidad de Muestra', tier: 'B', anchor: 'empleo', review: true },
    {
      org: 3,
      display: 'Diario Inventado',
      person: 'Fede Demo',
      role: 'Redacción de tecnología',
      tier: 'B',
      anchor: 'prensa',
    },
    { org: 3, display: 'Diario Inventado', tier: 'B', anchor: 'prensa', status: 'bounced' },
    {
      org: 3,
      display: 'Diario Inventado',
      person: 'Gala Ficticia',
      role: 'Dirección',
      tier: 'A',
      anchor: 'prensa',
      hold: true,
    },
  ];
  for (const [n, contact] of contacts.entries()) {
    const handle = (contact.person ?? `buzon ${n + 1}`)
      .toLowerCase()
      .replaceAll(' ', '.')
      .normalize('NFD')
      .replaceAll(/\p{M}/gu, '');
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO app.contacts (organisation_id, org_display, person_name, role, email, territory, tier, anchor,
                                 reason, sources, needs_review, hold, hold_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        orgIds[contact.org],
        contact.display,
        contact.person ?? null,
        contact.role ?? null,
        `${handle}@ejemplo.test`,
        organisations[contact.org]?.[2] ?? null,
        contact.tier,
        contact.anchor,
        contact.review ? null : 'Contacto de ejemplo para la campaña de ejemplo',
        contact.review ? [] : ['https://ejemplo.test/fuente'],
        contact.review === true,
        contact.hold === true,
        contact.hold ? 'Lo lleva otro equipo (ejemplo)' : null,
      ],
    );
    if (contact.hold) {
      continue;
    }
    const target = await db.query<{ id: string }>(
      `INSERT INTO app.campaign_targets (campaign_id, contact_id, priority) VALUES ($1, $2, $3) RETURNING id`,
      [campaignId, rows[0]?.id, contact.priority ?? null],
    );
    // Through the same rules as staff: sent first, then whatever came after.
    const path = !contact.status
      ? []
      : contact.status === 'sent'
        ? ['sent']
        : ['sent', contact.status];
    for (const status of path) {
      await db.query('UPDATE app.campaign_targets SET status = $2 WHERE id = $1', [
        target.rows[0]?.id,
        status,
      ]);
    }
  }
};

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
  const campaign = await client.query('SELECT 1 FROM app.campaigns WHERE slug = $1', [
    OUTREACH_SLUG,
  ]);
  if (campaign.rows.length > 0) {
    console.log('Outreach already seeded: nothing added');
  } else {
    await client.query('BEGIN');
    await seedOutreach(client);
    await client.query('COMMIT');
    console.log('Seeded an outreach campaign with 4 organisations and 10 contacts');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
