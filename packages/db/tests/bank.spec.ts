import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { superuserUrl } from './env.js';
import { ACCOUNTING, USERS } from './fixtures.js';

/**
 * The bank's statements and the budget (accounting spec §6, step 2; migrations bank_statements, budgets), each rule
 * broken by a mutation in scripts/mutations/bank.json. The fixtures: a statement of the closed year whose line is
 * matched to its donation; this year, one whose line is matched to the posted income and one whose line (-12,50 €)
 * waits for the draft expense; budget lines for 74 in the closed year and 62 this year.
 */

const THIS_YEAR = 'extract(year FROM current_date)::integer';
const on = (year: string, month: number, day: number): string =>
  `make_date(${year}, ${month}, ${day})`;
const THIS = (month = 1, day = 4): string => on(THIS_YEAR, month, day);
const LAST = (month = 6, day = 1): string => on(`${THIS_YEAR} - 1`, month, day);
const CLOSED = (month = 6, day = 20): string => on(`${THIS_YEAR} - 2`, month, day);

const RESTRICT = '23001';
const CHECK = '23514';
const UNIQUE = '23505';
const FOREIGN_KEY = '23503';

const asTreasurer = (client: pg.Client) =>
  actAs(client, 'pauseai_backoffice_app', { userId: USERS.treasurer, aal: 2, channel: 'web' });

type Line = readonly [code: string, debit: number, credit: number];

/** A posted entry with its lines, as tesorería writes one; its id. */
const posted = async (
  client: pg.Client,
  lines: readonly Line[],
  options: { date?: string; kind?: string; reverses?: string; draft?: boolean } = {},
): Promise<string> => {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO app.journal_entries (entry_date, description, kind, reverses)
     VALUES (${options.date ?? THIS()}, 'Asiento de prueba', $1, $2) RETURNING id`,
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
  if (!options.draft) {
    await client.query(`UPDATE app.journal_entries SET status = 'posted' WHERE id = $1`, [id]);
  }
  return id;
};

const EXPENSE: readonly Line[] = [
  ['628', 1250, 0],
  ['5720001', 0, 1250],
];
const INCOME: readonly Line[] = [
  ['5720001', 1250, 0],
  ['7400002', 0, 1250],
];
const mirror = (lines: readonly Line[]): Line[] =>
  lines.map(([code, debit, credit]) => [code, credit, debit]);

/** Matches a line to an entry, or undoes its match with `null`; the SQLSTATE it was refused with, or null. */
const match = (client: pg.Client, line: string, entry: string | null): Promise<string | null> =>
  errorCode(client, 'UPDATE app.bank_statement_lines SET entry_id = $1 WHERE id = $2', [
    entry,
    line,
  ]);

/** A line of a statement, as the API imports one: the SQLSTATE it was refused with, or null. */
const importLine = (
  client: pg.Client,
  values: {
    statement?: string;
    account?: string;
    day?: string;
    cents?: number;
    fingerprint?: string;
  } = {},
): Promise<string | null> =>
  errorCode(
    client,
    `INSERT INTO app.bank_statement_lines (statement_id, account_id, booked_on, value_on, common_concept,
                                           amount_cents, description, reference, fingerprint)
     VALUES ($1, $2, ${values.day ?? THIS()}, ${values.day ?? THIS()}, '04', $3, 'TRANSFERENCIA DE PRUEBA', '',
             coalesce($4, encode(sha256(gen_random_uuid()::text::bytea), 'hex')))`,
    [
      values.statement ?? ACCOUNTING.openStatement,
      values.account ?? ACCOUNTING.bank,
      values.cents ?? 1250,
      values.fingerprint ?? null,
    ],
  );

const accountId = async (client: pg.Client, code: string): Promise<string> =>
  (await client.query<{ id: string }>('SELECT id FROM app.ledger_accounts WHERE code = $1', [code]))
    .rows[0]?.id ?? '';

describe('a statement and its lines are of a treasury account (bank_statements)', () => {
  it('imports a statement of a treasury account, and refuses one of any other', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const insert = (account: string, endsOn = THIS(2, 28)) =>
        errorCode(
          client,
          `INSERT INTO app.bank_statements (account_id, sha256, starts_on, ends_on, opening_cents, closing_cents)
           VALUES ($1, repeat('e', 64), ${THIS(2, 1)}, ${endsOn}, 0, 0)`,
          [account],
        );
      expect(await insert(ACCOUNTING.bank)).toBeNull();
      expect(await insert(await accountId(client, '628'))).toBe(CHECK);
      expect(await insert(await accountId(client, '572'))).toBe(CHECK);
      // Its period ends on its first day at the earliest.
      expect(await insert(ACCOUNTING.bank, THIS(2, 1))).toBeNull();
      expect(await insert(ACCOUNTING.bank, THIS(1, 31))).toBe(CHECK);
    });
  });

  it("refuses a line of another account than its statement's", async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO app.ledger_accounts (code, name, kind, parent_code, treasury)
         VALUES ('5700001', 'Caja de prueba', 'asset', '570', true) RETURNING id`,
      );
      expect(await importLine(client, { account: rows[0]?.id ?? '' })).toBe(FOREIGN_KEY);
      expect(await importLine(client)).toBeNull();
      // Money in or out, never nothing.
      expect(await importLine(client, { cents: -1 })).toBeNull();
      expect(await importLine(client, { cents: 0 })).toBe(CHECK);
    });
  });
});

describe('a bank line is imported once (bank_statements)', () => {
  it('refuses the same fingerprint twice in an account, from any of its statements', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const fingerprint = 'f'.repeat(64);
      expect(await importLine(client, { fingerprint })).toBeNull();
      expect(await importLine(client, { fingerprint })).toBe(UNIQUE);
      expect(await importLine(client, { statement: ACCOUNTING.statement, fingerprint })).toBe(
        UNIQUE,
      );
    });
  });
});

describe('a bank line never changes but for its match (bank_statements)', () => {
  it('refuses changing what the bank said, even for the owner', async () => {
    await inRolledBackTransaction(async (client) => {
      for (const set of [
        'amount_cents = 1',
        "description = 'Otra cosa'",
        "reference = 'Otra'",
        `booked_on = ${THIS(1, 5)}`,
        `value_on = ${THIS(1, 5)}`,
        "common_concept = '99'",
        "fingerprint = repeat('0', 64)",
        `statement_id = '${ACCOUNTING.statement}'`,
      ]) {
        expect(
          await errorCode(client, `UPDATE app.bank_statement_lines SET ${set} WHERE id = $1`, [
            ACCOUNTING.openLine,
          ]),
        ).toBe(RESTRICT);
      }
    });
  });

  it('stamps who matched it and when, which nobody else sets', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(await match(client, ACCOUNTING.openLine, await posted(client, EXPENSE))).toBeNull();
      const stamps = async () =>
        (
          await client.query(
            `SELECT matched_by, matched_at IS NOT NULL AS dated FROM app.bank_statement_lines WHERE id = $1`,
            [ACCOUNTING.openLine],
          )
        ).rows;
      expect(await stamps()).toEqual([{ matched_by: USERS.treasurer, dated: true }]);
      await client.query('RESET ROLE');
      await client.query(
        'UPDATE app.bank_statement_lines SET matched_by = $1, matched_at = NULL WHERE id = $2',
        [USERS.adminA, ACCOUNTING.openLine],
      );
      expect(await stamps()).toEqual([{ matched_by: USERS.treasurer, dated: true }]);
      await asTreasurer(client);
      expect(await match(client, ACCOUNTING.openLine, null)).toBeNull();
      expect(await stamps()).toEqual([{ matched_by: null, dated: false }]);
    });
  });

  it('never deletes a matched line, its statement deleted or not; an import of none is undone whole', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await errorCode(client, 'DELETE FROM app.bank_statement_lines WHERE id = $1', [
          ACCOUNTING.matchedLine,
        ]),
      ).toBe(RESTRICT);
      await asTreasurer(client);
      expect(
        await errorCode(client, 'DELETE FROM app.bank_statements WHERE id = $1', [
          ACCOUNTING.statement,
        ]),
      ).toBe(RESTRICT);
      expect(
        await errorCode(client, 'DELETE FROM app.bank_statements WHERE id = $1', [
          ACCOUNTING.openStatement,
        ]),
      ).toBeNull();
      const { rows } = await client.query('SELECT 1 FROM app.bank_statement_lines WHERE id = $1', [
        ACCOUNTING.openLine,
      ]);
      expect(rows).toHaveLength(0);
    });
  });
});

describe('a match names a posted entry that moves the line’s account by its amount (bank_statements)', () => {
  it('matches a posted entry of a form that moves the account by exactly the amount, and undoes it', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      await client.query(`UPDATE app.journal_entries SET status = 'posted' WHERE id = $1`, [
        ACCOUNTING.draft,
      ]);
      expect(await match(client, ACCOUNTING.openLine, ACCOUNTING.draft)).toBeNull();
      expect(await match(client, ACCOUNTING.openLine, null)).toBeNull();
      // A transfer moves each of its accounts: the bank's side matches the bank's line.
      await client.query(
        `INSERT INTO app.ledger_accounts (code, name, kind, parent_code, treasury)
         VALUES ('5700001', 'Caja de prueba', 'asset', '570', true)`,
      );
      const transfer = await posted(
        client,
        [
          ['5700001', 1250, 0],
          ['5720001', 0, 1250],
        ],
        { kind: 'transfer' },
      );
      expect(await match(client, ACCOUNTING.openLine, transfer)).toBeNull();
    });
  });

  it('refuses a draft, another amount, the other way, or an entry that moves another account', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const line = ACCOUNTING.openLine;
      expect(await match(client, line, await posted(client, EXPENSE, { draft: true }))).toBe(CHECK);
      expect(
        await match(
          client,
          line,
          await posted(client, [
            ['628', 1200, 0],
            ['5720001', 0, 1200],
          ]),
        ),
      ).toBe(CHECK);
      expect(await match(client, line, await posted(client, INCOME))).toBe(CHECK);
      expect(
        await match(
          client,
          line,
          await posted(client, [
            ['628', 1250, 0],
            ['629', 0, 1250],
          ]),
        ),
      ).toBe(CHECK);
    });
  });

  it('refuses a corrected entry, a reversal, and the opening entry', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const corrected = await posted(client, EXPENSE);
      await posted(client, mirror(EXPENSE), { kind: 'reversal', reverses: corrected });
      expect(await match(client, ACCOUNTING.openLine, corrected)).toBe(CHECK);
      // An income reversed moves the bank by -12,50 €, as the line does: still not a match.
      const income = await posted(client, INCOME);
      const reversal = await posted(client, mirror(INCOME), {
        kind: 'reversal',
        reverses: income,
      });
      expect(await match(client, ACCOUNTING.openLine, reversal)).toBe(CHECK);
      // Last year's opening entry carried the bank's 50,00 € forward; a line of 50,00 € isn't it.
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM app.journal_entries WHERE kind = 'opening' AND fiscal_year = ${THIS_YEAR} - 1`,
      );
      const opening = rows[0]?.id ?? '';
      const { rows: statements } = await client.query<{ id: string }>(
        `INSERT INTO app.bank_statements (account_id, sha256, starts_on, ends_on, opening_cents, closing_cents)
         VALUES ($1, repeat('e', 64), ${LAST(1, 1)}, ${LAST(1, 31)}, 0, 5000) RETURNING id`,
        [ACCOUNTING.bank],
      );
      const { rows: lines } = await client.query<{ id: string }>(
        `INSERT INTO app.bank_statement_lines (statement_id, account_id, booked_on, value_on, common_concept,
                                               amount_cents, description, reference, fingerprint)
         VALUES ($1, $2, ${LAST(1, 1)}, ${LAST(1, 1)}, '99', 5000, 'SALDO', '', repeat('e', 64)) RETURNING id`,
        [statements[0]?.id, ACCOUNTING.bank],
      );
      expect(await match(client, lines[0]?.id ?? '', opening)).toBe(CHECK);
    });
  });

  it('matches an entry to one line of an account at most', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO app.bank_statement_lines (statement_id, account_id, booked_on, value_on, common_concept,
                                               amount_cents, description, reference, fingerprint)
         VALUES ($1, $2, ${THIS(1, 3)}, ${THIS(1, 3)}, '04', 2000, 'OTRA TRANSFERENCIA', '', repeat('e', 64))
         RETURNING id`,
        [ACCOUNTING.statement, ACCOUNTING.bank],
      );
      expect(await match(client, rows[0]?.id ?? '', ACCOUNTING.posted)).toBe(UNIQUE);
    });
  });

  it('keeps a match whose entry is corrected later: the staff app asks for the corrected one', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      await posted(
        client,
        [
          ['5720001', 0, 2000],
          ['7400002', 2000, 0],
        ],
        { kind: 'reversal', reverses: ACCOUNTING.posted },
      );
      const { rows } = await client.query(
        'SELECT entry_id FROM app.bank_statement_lines WHERE id = $1',
        [ACCOUNTING.matchedLine],
      );
      expect(rows).toEqual([{ entry_id: ACCOUNTING.posted }]);
    });
  });
});

describe('nothing is written dated in a closed year (bank_statements, budgets)', () => {
  it('imports no line dated there, and neither makes nor undoes a match there', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await importLine(client, { statement: ACCOUNTING.closedStatement, day: CLOSED() }),
      ).toBe(RESTRICT);
      expect(await match(client, ACCOUNTING.closedLine, null)).toBe(RESTRICT);
      expect(
        await errorCode(client, 'DELETE FROM app.bank_statements WHERE id = $1', [
          ACCOUNTING.closedStatement,
        ]),
      ).toBe(RESTRICT);
    });
  });

  it("neither adds to, changes nor removes a closed year's budget", async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(
        await errorCode(
          client,
          `INSERT INTO app.budget_lines (fiscal_year, account_id, amount_cents)
           VALUES (${THIS_YEAR} - 2, $1, 100)`,
          [await accountId(client, '62')],
        ),
      ).toBe(RESTRICT);
      expect(
        await errorCode(client, 'UPDATE app.budget_lines SET amount_cents = 1 WHERE id = $1', [
          ACCOUNTING.closedBudget,
        ]),
      ).toBe(RESTRICT);
      expect(
        await errorCode(client, 'DELETE FROM app.budget_lines WHERE id = $1', [
          ACCOUNTING.closedBudget,
        ]),
      ).toBe(RESTRICT);
      // This year's changes.
      expect(
        await errorCode(client, 'UPDATE app.budget_lines SET amount_cents = 1 WHERE id = $1', [
          ACCOUNTING.budget,
        ]),
      ).toBeNull();
    });
  });
});

describe('a budget line is of an income or expense account, budgeted once (budgets)', () => {
  const budget = async (client: pg.Client, code: string, year: string, cents = 10000) =>
    errorCode(
      client,
      `INSERT INTO app.budget_lines (fiscal_year, account_id, amount_cents) VALUES (${year}, $1, $2)`,
      [await accountId(client, code), cents],
    );

  it('takes an income or expense account, a group or a leaf, for more than zero', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      expect(await budget(client, '7400002', THIS_YEAR)).toBeNull();
      expect(await budget(client, '65', THIS_YEAR)).toBeNull();
      expect(await budget(client, '5720001', THIS_YEAR)).toBe(CHECK);
      expect(await budget(client, '129', THIS_YEAR)).toBe(CHECK);
      expect(await budget(client, '720', THIS_YEAR, 0)).toBe(CHECK);
      expect(await budget(client, '720', THIS_YEAR, -100)).toBe(CHECK);
    });
  });

  it('refuses a line under a budgeted group, or a group over a budgeted line, in the same year', async () => {
    await inRolledBackTransaction(async (client) => {
      await asTreasurer(client);
      // 62 is budgeted this year: 626 is under it.
      expect(await budget(client, '626', THIS_YEAR)).toBe(CHECK);
      expect(await budget(client, '62', `${THIS_YEAR} - 1`)).toBeNull();
      // 7400002 budgeted, 74 is over it; its sibling isn't.
      expect(await budget(client, '7400002', `${THIS_YEAR} - 1`)).toBeNull();
      expect(await budget(client, '74', `${THIS_YEAR} - 1`)).toBe(CHECK);
      expect(await budget(client, '7400001', `${THIS_YEAR} - 1`)).toBeNull();
    });
  });

  it('makes a line wait for another in the same year, rather than both pass', async () => {
    const first = new pg.Client({ connectionString: superuserUrl() });
    const second = new pg.Client({ connectionString: superuserUrl() });
    await first.connect();
    await second.connect();
    try {
      await first.query('BEGIN');
      await asTreasurer(first);
      await budget(first, '720', THIS_YEAR);
      await second.query('BEGIN');
      await asTreasurer(second);
      await second.query("SET LOCAL lock_timeout = '300ms'");
      const waited = await second
        .query(
          `INSERT INTO app.budget_lines (fiscal_year, account_id, amount_cents)
           SELECT ${THIS_YEAR}, a.id, 100 FROM app.ledger_accounts a WHERE a.code = '72'`,
        )
        .then(
          () => undefined,
          (error: unknown) => error as { code?: string; where?: string },
        );
      // It waited on the year's row, which the first line holds until it ends.
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
