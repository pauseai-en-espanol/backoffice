import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { superuserUrl } from './env.js';
import { ACCOUNTING, USERS } from './fixtures.js';

/**
 * The books' rules in the database (ADR-0006 decision 4; migrations chart_of_accounts, journal, receipts), each
 * broken by a mutation in scripts/mutations/accounting.json. The fixtures' years are relative to today: the year
 * before last closed, last year open with its opening entry alone, this year open with two drafts and a posted income.
 */

const THIS_YEAR = 'extract(year FROM current_date)::integer';
const on = (year: string, month: number, day: number): string =>
  `make_date(${year}, ${month}, ${day})`;
const THIS = (month = 1, day = 3): string => on(THIS_YEAR, month, day);
const LAST = (month = 6, day = 1): string => on(`${THIS_YEAR} - 1`, month, day);
const CLOSED = (month = 6, day = 1): string => on(`${THIS_YEAR} - 2`, month, day);

const RESTRICT = '23001';
const CHECK = '23514';
const UNIQUE = '23505';

/** Acts as the treasurer through the staff app, at aal 2, for the rest of the transaction. */
const asTreasurer = (client: pg.Client) =>
  actAs(client, 'pauseai_backoffice_app', { userId: USERS.treasurer, aal: 2, channel: 'web' });

type Line = readonly [code: string, debit: number, credit: number];

/** A draft with its lines, as tesorería writes one; its id. */
const draft = async (
  client: pg.Client,
  date: string,
  lines: readonly Line[],
  options: { kind?: string; reverses?: string } = {},
): Promise<string> => {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO app.journal_entries (entry_date, description, kind, reverses)
     VALUES (${date}, 'Asiento de prueba', $1, $2) RETURNING id`,
    [options.kind ?? 'manual', options.reverses ?? null],
  );
  const id = rows[0]?.id ?? '';
  for (const [code, debit, credit] of lines) {
    await client.query(
      `INSERT INTO app.journal_lines (entry_id, account_id, debit_cents, credit_cents)
       SELECT $1, a.id, $3, $4 FROM app.ledger_accounts a WHERE a.code = $2`,
      [id, code, debit, credit],
    );
  }
  return id;
};

/** Posts an entry; the SQLSTATE it was refused with, or null. */
const post = (client: pg.Client, id: string): Promise<string | null> =>
  errorCode(client, `UPDATE app.journal_entries SET status = 'posted' WHERE id = $1`, [id]);

const numberOf = async (client: pg.Client, id: string): Promise<number | null> =>
  (
    await client.query<{ number: number | null }>(
      'SELECT number FROM app.journal_entries WHERE id = $1',
      [id],
    )
  ).rows[0]?.number ?? null;

const INCOME: readonly Line[] = [
  ['5720001', 1000, 0],
  ['7400002', 0, 1000],
];

describe('a posted entry balances (ADR-0006 decision 4)', () => {
  it('posts when its debits equal its credits, across two lines or more', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const id = await draft(client, THIS(), INCOME);
      expect(await post(client, id)).toBeNull();
      expect(await numberOf(client, id)).not.toBeNull();
      const split = await draft(client, THIS(), [
        ['5720001', 1000, 0],
        ['7400001', 0, 400],
        ['7400002', 0, 600],
      ]);
      expect(await post(client, split)).toBeNull();
    });
  });

  it('refuses debits that differ from credits, a single line, and no lines at all', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const unbalanced = await draft(client, THIS(), [
        ['5720001', 1000, 0],
        ['7400002', 0, 999],
      ]);
      expect(await post(client, unbalanced)).toBe(CHECK);
      expect(await post(client, await draft(client, THIS(), [['5720001', 1000, 0]]))).toBe(CHECK);
      expect(await post(client, await draft(client, THIS(), []))).toBe(CHECK);
      // Drafts may be anything meanwhile: they count nowhere.
      expect(await numberOf(client, unbalanced)).toBeNull();
    });
  });

  it('keeps a line to one side, by more than zero', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      for (const [debit, credit] of [
        [100, 100],
        [0, 0],
        [-100, 0],
      ] as const) {
        expect(
          await errorCode(
            client,
            `INSERT INTO app.journal_lines (entry_id, account_id, debit_cents, credit_cents) VALUES ($1, $2, $3, $4)`,
            [ACCOUNTING.draft, ACCOUNTING.bank, debit, credit],
          ),
        ).toBe(CHECK);
      }
    });
  });
});

describe('a posted entry never changes (ADR-0006 decision 4)', () => {
  it('refuses changing, unposting or deleting it', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      for (const set of [
        "description = 'Cambiada'",
        `entry_date = ${THIS(2, 1)}`,
        "status = 'draft'",
      ]) {
        expect(
          await errorCode(client, `UPDATE app.journal_entries SET ${set} WHERE id = $1`, [
            ACCOUNTING.posted,
          ]),
        ).toBe(RESTRICT);
      }
      expect(
        await errorCode(client, 'DELETE FROM app.journal_entries WHERE id = $1', [
          ACCOUNTING.posted,
        ]),
      ).toBe(RESTRICT);
    });
  });

  it('refuses adding a line to it or removing one of its lines', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await errorCode(
          client,
          'INSERT INTO app.journal_lines (entry_id, account_id, debit_cents) VALUES ($1, $2, 1)',
          [ACCOUNTING.posted, ACCOUNTING.bank],
        ),
      ).toBe(RESTRICT);
      expect(
        await errorCode(client, 'DELETE FROM app.journal_lines WHERE id = $1', [
          ACCOUNTING.postedLine,
        ]),
      ).toBe(RESTRICT);
    });
  });

  it('refuses the owner too an edit of its lines, which no one else may edit at all', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await errorCode(client, 'UPDATE app.journal_lines SET debit_cents = 1 WHERE id = $1', [
          ACCOUNTING.postedLine,
        ]),
      ).toBe(RESTRICT);
      expect(
        await errorCode(client, 'UPDATE app.journal_lines SET entry_id = $1 WHERE id = $2', [
          ACCOUNTING.posted,
          ACCOUNTING.draftLine,
        ]),
      ).toBe(RESTRICT);
    });
  });

  it('lets tesorería change and delete a draft, its lines going with it', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await errorCode(
          client,
          "UPDATE app.journal_entries SET description = 'Otra' WHERE id = $1",
          [ACCOUNTING.draft],
        ),
      ).toBeNull();
      expect(
        await errorCode(client, 'DELETE FROM app.journal_lines WHERE id = $1', [
          ACCOUNTING.draftLine,
        ]),
      ).toBeNull();
      expect(
        await errorCode(client, 'DELETE FROM app.journal_entries WHERE id = $1', [
          ACCOUNTING.draft,
        ]),
      ).toBeNull();
      await client.query('RESET ROLE');
      const { rows } = await client.query('SELECT 1 FROM app.journal_lines WHERE entry_id = $1', [
        ACCOUNTING.draft,
      ]);
      expect(rows).toEqual([]);
    });
  });

  it('is written as a draft, its number and who posted it the database’s, even for the owner', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.aal', '2', true)`,
        [USERS.treasurer],
      );
      expect(
        await errorCode(
          client,
          `INSERT INTO app.journal_entries (entry_date, description, kind, status, number, posted_at, posted_by)
           VALUES (${THIS()}, 'Ya contabilizado', 'manual', 'posted', 99, now(), $1)`,
          [USERS.treasurer],
        ),
      ).toBe(RESTRICT);
      const { rows } = await client.query<{ number: number | null; posted_by: string | null }>(
        `INSERT INTO app.journal_entries (entry_date, description, kind, number, posted_at, posted_by)
         VALUES (${THIS()}, 'Borrador', 'manual', 99, now(), $1) RETURNING number, posted_by`,
        [USERS.adminA],
      );
      expect(rows).toEqual([{ number: null, posted_by: null }]);
    });
  });
});

describe('a posted entry is numbered in its year, without gaps (ADR-0006 decision 4)', () => {
  it('takes the next number in its year as it is posted, whatever order the drafts were made in', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const { rows } = await client.query<{ last: number }>(
        `SELECT max(number) AS last FROM app.journal_entries WHERE fiscal_year = ${THIS_YEAR}`,
      );
      const last = rows[0]?.last ?? 0;
      const first = await draft(client, THIS(), INCOME);
      const second = await draft(client, THIS(), INCOME);
      // A draft deleted on the way takes no number with it.
      const dropped = await draft(client, THIS(), INCOME);
      await client.query('DELETE FROM app.journal_entries WHERE id = $1', [dropped]);
      expect(await post(client, second)).toBeNull();
      expect(await post(client, first)).toBeNull();
      expect(await numberOf(client, second)).toBe(last + 1);
      expect(await numberOf(client, first)).toBe(last + 2);
      // Last year's numbering is its own.
      const lastYear = await draft(client, LAST(), INCOME);
      expect(await post(client, lastYear)).toBeNull();
      expect(await numberOf(client, lastYear)).toBe(2);
      // And stamps who posted it, and when.
      const { rows: stamps } = await client.query(
        'SELECT posted_by, posted_at IS NOT NULL AS dated FROM app.journal_entries WHERE id = $1',
        [first],
      );
      expect(stamps).toEqual([{ posted_by: USERS.treasurer, dated: true }]);
    });
  });

  it('makes a posting wait for another in the same year, rather than take its number', async () => {
    const first = new pg.Client({ connectionString: superuserUrl() });
    const second = new pg.Client({ connectionString: superuserUrl() });
    await first.connect();
    await second.connect();
    try {
      await first.query('BEGIN');
      await asTreasurer(first);
      await first.query(`UPDATE app.journal_entries SET status = 'posted' WHERE id = $1`, [
        ACCOUNTING.draft,
      ]);
      await second.query('BEGIN');
      await asTreasurer(second);
      await second.query("SET LOCAL lock_timeout = '300ms'");
      const waited = await second
        .query(`UPDATE app.journal_entries SET status = 'posted' WHERE id = $1`, [
          ACCOUNTING.draftWithReceipt,
        ])
        .then(
          () => undefined,
          (error: unknown) => error as { code?: string; where?: string },
        );
      // It waited on the year's row, which the first posting holds until it ends.
      expect(waited?.code).toBe('55P03');
      expect(waited?.where).toMatch(/relation "fiscal_years"/u);
    } finally {
      await first.query('ROLLBACK').catch(() => undefined);
      await second.query('ROLLBACK').catch(() => undefined);
      await first.end();
      await second.end();
    }
  });
});

describe('a reversing entry corrects a posted one, once (ADR-0006 decision 4)', () => {
  const MIRROR: readonly Line[] = [
    ['5720001', 0, 2000],
    ['7400002', 2000, 0],
  ];

  it('posts when it mirrors the entry it reverses, on its date or later, and only once', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const reversal = await draft(client, THIS(2, 1), MIRROR, {
        kind: 'reversal',
        reverses: ACCOUNTING.posted,
      });
      expect(await post(client, reversal)).toBeNull();
      expect(
        await errorCode(
          client,
          `INSERT INTO app.journal_entries (entry_date, description, kind, reverses)
           VALUES (${THIS(2, 1)}, 'Otra vez', 'reversal', $1)`,
          [ACCOUNTING.posted],
        ),
      ).toBe(UNIQUE);
    });
  });

  it('refuses lines that don’t mirror the original’s, in amount, side or account', async () => {
    for (const lines of [
      [
        ['5720001', 0, 1500],
        ['7400002', 1500, 0],
      ],
      [
        ['5720001', 2000, 0],
        ['7400002', 0, 2000],
      ],
      [
        ['5720001', 0, 2000],
        ['7400001', 2000, 0],
      ],
      [
        ['5720001', 0, 2000],
        ['7400002', 1000, 0],
        ['7400002', 1000, 0],
      ],
    ] as const) {
      await inRolledBackTransaction(async (client) => {
        await asTreasurer(client);
        const reversal = await draft(client, THIS(2, 1), lines, {
          kind: 'reversal',
          reverses: ACCOUNTING.posted,
        });
        expect({ lines, refused: await post(client, reversal) }).toEqual({ lines, refused: CHECK });
      });
    }
  });

  it('refuses a reversal that undoes only part of the original', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const original = await draft(client, THIS(), [
        ['5720001', 1000, 0],
        ['5720001', 1000, 0],
        ['7400002', 0, 1000],
        ['7400002', 0, 1000],
      ]);
      expect(await post(client, original)).toBeNull();
      const half = await draft(
        client,
        THIS(),
        [
          ['5720001', 0, 1000],
          ['7400002', 1000, 0],
        ],
        { kind: 'reversal', reverses: original },
      );
      expect(await post(client, half)).toBe(CHECK);
    });
  });

  it('refuses reversing a draft, a reversal, an opening or closing entry, or a date before the original’s', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const ofDraft = await draft(
        client,
        THIS(2, 1),
        [
          ['5720001', 1250, 0],
          ['628', 0, 1250],
        ],
        { kind: 'reversal', reverses: ACCOUNTING.draft },
      );
      expect(await post(client, ofDraft)).toBe(CHECK);
      const early = await draft(client, THIS(1, 1), MIRROR, {
        kind: 'reversal',
        reverses: ACCOUNTING.posted,
      });
      expect(await post(client, early)).toBe(CHECK);
      await client.query('DELETE FROM app.journal_entries WHERE id = $1', [early]);
      const reversal = await draft(client, THIS(2, 1), MIRROR, {
        kind: 'reversal',
        reverses: ACCOUNTING.posted,
      });
      expect(await post(client, reversal)).toBeNull();
      const ofReversal = await draft(
        client,
        THIS(2, 2),
        [
          ['5720001', 2000, 0],
          ['7400002', 0, 2000],
        ],
        { kind: 'reversal', reverses: reversal },
      );
      expect(await post(client, ofReversal)).toBe(CHECK);
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM app.journal_entries WHERE kind = 'opening' AND fiscal_year = ${THIS_YEAR} - 1`,
      );
      const ofOpening = await draft(
        client,
        THIS(2, 3),
        [
          ['5720001', 0, 5000],
          ['129', 5000, 0],
        ],
        { kind: 'reversal', reverses: rows[0]?.id ?? '' },
      );
      expect(await post(client, ofOpening)).toBe(CHECK);
      const { rows: closing } = await client.query<{ id: string }>(
        `SELECT id FROM app.journal_entries WHERE kind = 'closing' AND fiscal_year = ${THIS_YEAR} - 2`,
      );
      const ofClosing = await draft(
        client,
        THIS(2, 4),
        [
          ['129', 5000, 0],
          ['7400002', 0, 5000],
        ],
        { kind: 'reversal', reverses: closing[0]?.id ?? '' },
      );
      expect(await post(client, ofClosing)).toBe(CHECK);
    });
  });

  it('corrects an entry of a closed year from an open one', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const reversal = await draft(
        client,
        THIS(),
        [
          ['5720001', 0, 5000],
          ['7400002', 5000, 0],
        ],
        { kind: 'reversal', reverses: ACCOUNTING.closedEntry },
      );
      expect(await post(client, reversal)).toBeNull();
    });
  });
});

describe('nothing is written dated in a closed year (ADR-0006 decision 4)', () => {
  it('refuses an entry made there, a draft moved there, and a receipt attached to an entry there', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await errorCode(
          client,
          `INSERT INTO app.journal_entries (entry_date, description, kind) VALUES (${CLOSED()}, 'Tarde', 'manual')`,
        ),
      ).toBe(RESTRICT);
      expect(
        await errorCode(
          client,
          `UPDATE app.journal_entries SET entry_date = ${CLOSED()} WHERE id = $1`,
          [ACCOUNTING.draft],
        ),
      ).toBe(RESTRICT);
      expect(
        await errorCode(
          client,
          `INSERT INTO app.receipts (id, entry_id, file_name, content_type, byte_size, sha256)
           VALUES (gen_random_uuid(), $1, 'tarde.pdf', 'application/pdf', 10, repeat('d', 64))`,
          [ACCOUNTING.closedEntry],
        ),
      ).toBe(RESTRICT);
    });
  });

  it('refuses even the owner, and never reopens the year', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await errorCode(
          client,
          `INSERT INTO app.journal_entries (entry_date, description, kind) VALUES (${CLOSED()}, 'Tarde', 'manual')`,
        ),
      ).toBe(RESTRICT);
      await asTreasurer(client);
      expect(
        await errorCode(
          client,
          `UPDATE app.fiscal_years SET status = 'open', assembly_on = NULL WHERE year = ${THIS_YEAR} - 2`,
        ),
      ).toBe(RESTRICT);
    });
  });
});

describe('closing a year (accounting spec §3)', () => {
  const close = (client: pg.Client, year: string, assembly = 'current_date') =>
    errorCode(
      client,
      `UPDATE app.fiscal_years SET status = 'closed', assembly_on = ${assembly} WHERE year = ${year}`,
    );

  /** An entry's lines, by account code, as [code, debit, credit]. */
  const linesOf = async (client: pg.Client, kind: string, year: string) =>
    (
      await client.query<{ code: string; debit: string; credit: string }>(
        `SELECT a.code, l.debit_cents AS debit, l.credit_cents AS credit
           FROM app.journal_lines l
           JOIN app.journal_entries e ON e.id = l.entry_id
           JOIN app.ledger_accounts a ON a.id = l.account_id
          WHERE e.kind = $1 AND e.fiscal_year = ${year} AND e.status = 'posted'
          ORDER BY a.code`,
        [kind],
      )
    ).rows.map((r) => [r.code, Number(r.debit), Number(r.credit)]);

  it('posts the closing entry, carries the balances into the next year and closes it for good', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await post(
          client,
          await draft(client, LAST(), [
            ['5720001', 3000, 0],
            ['7400002', 0, 3000],
          ]),
        ),
      ).toBeNull();
      expect(
        await post(
          client,
          await draft(client, LAST(7, 1), [
            ['626', 1000, 0],
            ['5720001', 0, 1000],
          ]),
        ),
      ).toBeNull();
      expect(await close(client, `${THIS_YEAR} - 1`)).toBeNull();

      // Income and expenses back to zero, the surplus to the year's result, on 31 December.
      expect(await linesOf(client, 'closing', `${THIS_YEAR} - 1`)).toEqual([
        ['129', 0, 2000],
        ['626', 0, 1000],
        ['7400002', 3000, 0],
      ]);
      // This year opens with what the bank and the result hold: last year's opening, plus the year.
      expect(await linesOf(client, 'opening', THIS_YEAR)).toEqual([
        ['129', 0, 7000],
        ['5720001', 7000, 0],
      ]);
      const { rows } = await client.query(
        `SELECT e.fiscal_year - ${THIS_YEAR} AS year, e.kind, to_char(e.entry_date, 'MM-DD') AS day, e.number
           FROM app.journal_entries e
          WHERE e.kind IN ('closing', 'opening') AND e.fiscal_year >= ${THIS_YEAR} - 1
          ORDER BY e.fiscal_year, e.number`,
      );
      // The closing entry follows last year's three; this year's opening follows its one posted entry.
      expect(rows).toEqual([
        { year: -1, kind: 'opening', day: '01-01', number: 1 },
        { year: -1, kind: 'closing', day: '12-31', number: 4 },
        { year: 0, kind: 'opening', day: '01-01', number: 2 },
      ]);
      const { rows: year } = await client.query(
        `SELECT status, closed_by, closed_at IS NOT NULL AS dated FROM app.fiscal_years WHERE year = ${THIS_YEAR} - 1`,
      );
      expect(year).toEqual([{ status: 'closed', closed_by: USERS.treasurer, dated: true }]);
    });
  });

  it('opens the next year if it isn’t open yet', async () => {
    await inRolledBackTransaction(async (client) => {
      // Last year and this one go back to unopened, past the triggers, as if the year before last were still open.
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(`DELETE FROM app.receipts`);
      await client.query(
        `DELETE FROM app.journal_lines WHERE entry_id <> '${ACCOUNTING.closedEntry}'`,
      );
      await client.query(`DELETE FROM app.journal_entries WHERE id <> '${ACCOUNTING.closedEntry}'`);
      await client.query(`DELETE FROM app.fiscal_years WHERE year >= ${THIS_YEAR} - 1`);
      await client.query(`UPDATE app.fiscal_years SET status = 'open', assembly_on = NULL, closed_at = NULL,
                                 closed_by = NULL WHERE year = ${THIS_YEAR} - 2`);
      await client.query("SET LOCAL session_replication_role = 'origin'");
      await asTreasurer(client);
      expect(await close(client, `${THIS_YEAR} - 2`)).toBeNull();
      const { rows } = await client.query(
        `SELECT year - ${THIS_YEAR} AS year, status FROM app.fiscal_years ORDER BY year`,
      );
      expect(rows).toEqual([
        { year: -2, status: 'closed' },
        { year: -1, status: 'open' },
      ]);
      expect(await linesOf(client, 'opening', `${THIS_YEAR} - 1`)).toEqual([
        ['129', 0, 5000],
        ['5720001', 5000, 0],
      ]);
    });
  });

  it('needs the assembly after the year ended and not in the future', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(await close(client, `${THIS_YEAR} - 1`, LAST(12, 31))).toBe(CHECK);
      expect(await close(client, `${THIS_YEAR} - 1`, 'current_date + 1')).toBe(CHECK);
      expect(await close(client, `${THIS_YEAR} - 1`, 'NULL')).toBe(CHECK);
      // This year hasn't ended: no assembly can have approved it yet.
      expect(await close(client, THIS_YEAR)).toBe(CHECK);
      // Nor is the date written on an open year.
      expect(
        await errorCode(
          client,
          `UPDATE app.fiscal_years SET assembly_on = current_date WHERE year = ${THIS_YEAR} - 1`,
        ),
      ).toBe(CHECK);
    });
  });

  it('refuses a year with drafts, or with an earlier year still open', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      await draft(client, LAST(), INCOME);
      expect(await close(client, `${THIS_YEAR} - 1`)).toBe(CHECK);
    });
    await inRolledBackTransaction(async (client) => {
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(`UPDATE app.fiscal_years SET status = 'open', assembly_on = NULL, closed_at = NULL,
                                 closed_by = NULL WHERE year = ${THIS_YEAR} - 2`);
      await client.query("SET LOCAL session_replication_role = 'origin'");
      await asTreasurer(client);
      expect(await close(client, `${THIS_YEAR} - 1`)).toBe(CHECK);
    });
  });

  it('is tesorería’s alone, even for a year with nothing to carry forward', async () => {
    await inRolledBackTransaction(async (client) => {
      // Last year emptied, past the triggers: closing it would write nothing.
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(`DELETE FROM app.journal_lines l USING app.journal_entries e
                           WHERE e.id = l.entry_id AND e.fiscal_year = ${THIS_YEAR} - 1`);
      await client.query(`DELETE FROM app.journal_entries WHERE fiscal_year = ${THIS_YEAR} - 1`);
      await client.query("SET LOCAL session_replication_role = 'origin'");
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      const { rowCount } = await client.query(
        `UPDATE app.fiscal_years SET status = 'closed', assembly_on = current_date WHERE year = ${THIS_YEAR} - 1`,
      );
      expect(rowCount).toBe(0);
      await asTreasurer(client);
      expect(await close(client, `${THIS_YEAR} - 1`)).toBeNull();
    });
  });

  it('needs the chart’s account for the year’s result', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('UPDATE app.ledger_accounts SET year_result = false WHERE year_result');
      await asTreasurer(client);
      expect(await close(client, `${THIS_YEAR} - 1`)).toBe(CHECK);
    });
  });
});

describe('fiscal years', () => {
  it('open right after the last one', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await errorCode(client, `INSERT INTO app.fiscal_years (year) VALUES (${THIS_YEAR} + 2)`),
      ).toBe(CHECK);
      expect(
        await errorCode(client, `INSERT INTO app.fiscal_years (year) VALUES (${THIS_YEAR} + 1)`),
      ).toBeNull();
    });
  });
});

describe('the chart of accounts (accounting spec §1)', () => {
  it('takes lines only on an active account with no sub-accounts', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const line = (code: string) =>
        errorCode(
          client,
          `INSERT INTO app.journal_lines (entry_id, account_id, debit_cents)
           SELECT $1, a.id, 100 FROM app.ledger_accounts a WHERE a.code = $2`,
          [ACCOUNTING.draft, code],
        );
      expect(await line('62')).toBe(CHECK);
      expect(await line('740')).toBe(CHECK);
      expect(await line('626')).toBeNull();
      await client.query("UPDATE app.ledger_accounts SET active = false WHERE code = '627'");
      expect(await line('627')).toBe(CHECK);
    });
  });

  it('gives no sub-account to an account with lines, and deletes only one never used', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const sub = (code: string, parent: string) =>
        errorCode(
          client,
          `INSERT INTO app.ledger_accounts (code, name, kind, parent_code) VALUES ($1, 'Subcuenta', 'expense', $2)`,
          [code, parent],
        );
      expect(await sub('6280001', '628')).toBe(CHECK);
      expect(await sub('6260001', '626')).toBeNull();
      // A sub-account extends its parent's code and shares its kind.
      expect(await sub('6250001', '626')).toBe(CHECK);
      expect(
        await errorCode(
          client,
          `INSERT INTO app.ledger_accounts (code, name, kind, parent_code) VALUES ('6270001', 'Ingreso', 'income', '627')`,
        ),
      ).toBe('23503');
      expect(await errorCode(client, "DELETE FROM app.ledger_accounts WHERE code = '628'")).toBe(
        '23503',
      );
      expect(
        await errorCode(client, "DELETE FROM app.ledger_accounts WHERE code = '624'"),
      ).toBeNull();
    });
  });

  it('keeps a treasury account an asset, and an IBAN on a treasury account', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await errorCode(
          client,
          "UPDATE app.ledger_accounts SET treasury = true WHERE code = '626'",
        ),
      ).toBe(CHECK);
      expect(
        await errorCode(client, 'UPDATE app.ledger_accounts SET treasury = false WHERE id = $1', [
          ACCOUNTING.bank,
        ]),
      ).toBe(CHECK);
    });
  });
});

describe('receipts (ADR-0006 decision 7)', () => {
  it('stay with a posted entry, may be added to it, and go with a draft', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await errorCode(client, 'DELETE FROM app.receipts WHERE id = $1', [ACCOUNTING.receipt]),
      ).toBe(RESTRICT);
      expect(
        await errorCode(
          client,
          `INSERT INTO app.receipts (id, entry_id, file_name, content_type, byte_size, sha256)
           VALUES (gen_random_uuid(), $1, 'otro.pdf', 'application/pdf', 10, repeat('e', 64))`,
          [ACCOUNTING.posted],
        ),
      ).toBeNull();
      expect(
        await errorCode(client, 'DELETE FROM app.receipts WHERE id = $1', [
          ACCOUNTING.draftReceipt,
        ]),
      ).toBeNull();
    });
  });

  it("hold a draft back from deletion until they're removed", async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await errorCode(client, 'DELETE FROM app.journal_entries WHERE id = $1', [
          ACCOUNTING.draftWithReceipt,
        ]),
      ).toBe('23503');
    });
  });

  it('tell the API, without an actor, which files on the volume have no row, and nothing else', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app');
      const stray = '0190f8c4-0000-7000-8000-0000000006ff';
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM private.receipts_without_row($1::uuid[]) AS r(id)',
        [[ACCOUNTING.receipt, stray, ACCOUNTING.draftReceipt]],
      );
      expect(rows.map((r) => r.id)).toEqual([stray]);
      // Without an actor, the rows themselves stay hidden.
      expect((await client.query('SELECT 1 FROM app.receipts')).rows).toEqual([]);
    });
  });
});

describe('the audit log', () => {
  it('records the books’ writes without who money came from, an entry’s concept or a file’s name', async () => {
    await inRolledBackTransaction(async (client) => {
      const { rows } = await client.query<{ diff: Record<string, Record<string, unknown>> }>(
        `SELECT diff FROM app.audit_log
          WHERE action = 'insert' AND table_name IN ('counterparties', 'journal_entries', 'receipts')
            AND row_id = ANY ($1)`,
        [[ACCOUNTING.donor, ACCOUNTING.posted, ACCOUNTING.receipt]],
      );
      expect(rows).toHaveLength(3);
      for (const { diff } of rows) {
        for (const column of ['name', 'tax_id', 'province', 'iban', 'description', 'file_name']) {
          expect(diff.new).not.toHaveProperty(column);
        }
      }
    });
  });
});
