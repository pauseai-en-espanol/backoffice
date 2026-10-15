import type { Case, Principal } from './harness.js';

import { PRINCIPALS, RELATIONS, ROLES_OF, type Rule } from './matrix.js';

export interface MatrixCase extends Case {
  relation: string;
  /** "<operation> <row>", e.g. "update an onboarder". */
  name: string;
  expected: 'allow' | 'deny';
}

/**
 * What a rule says for one principal (ADR-0002): only the app role, for an active staff member who passed the second
 * factor, holding one of the roles the rule names for the channel the request came through.
 */
export const expectedOutcome = (principal: Principal, rule: Rule): 'allow' | 'deny' => {
  if (principal.role !== 'pauseai_backoffice_app' || principal.aal !== 2 || !principal.userId) {
    return 'deny';
  }
  const admitted = principal.channel === undefined ? undefined : rule[principal.channel];
  const held = ROLES_OF[principal.userId] ?? [];
  return admitted?.some((role) => held.includes(role)) ? 'allow' : 'deny';
};

/** Every principal × row × operation of every relation in the matrix. */
export const matrixCases = (): MatrixCase[] =>
  Object.entries(RELATIONS).flatMap(([relation, spec]) =>
    PRINCIPALS.flatMap((principal) => {
      const cases: MatrixCase[] = [];
      for (const row of spec.rows) {
        const target = `SELECT * FROM ${relation} WHERE ${row.where}`;
        const add = (op: string, sql: string, rule: Rule): void => {
          cases.push({
            relation,
            name: `${op} ${row.id}`,
            principal,
            sql,
            target,
            expected: expectedOutcome(principal, rule),
          });
        };
        add('select', `SELECT 1 FROM ${relation} WHERE ${row.where}`, row.select);
        if (row.update) {
          add(
            'update',
            `UPDATE ${relation} SET ${row.update.set} WHERE ${row.where}`,
            row.update.rule,
          );
        }
        if (row.delete) {
          add('delete', `DELETE FROM ${relation} WHERE ${row.where}`, row.delete);
        }
      }
      for (const insert of spec.inserts) {
        cases.push({
          relation,
          name: `insert ${insert.id}`,
          principal,
          sql: insert.sql,
          target: `SELECT count(*) FROM ${relation}`,
          expected: expectedOutcome(principal, insert.rule),
        });
      }
      return cases;
    }),
  );
