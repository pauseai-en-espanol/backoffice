import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  contactBook,
  type ContactBook,
  ContactsError,
  readGoogleContacts,
} from './imports/google-contacts.js';
import {
  ChatError,
  type DateOrder,
  historyRows,
  importCsv,
  isInside,
  parseChat,
  participantsOf,
  unresolvedCsv,
} from './imports/whatsapp-history.js';

/**
 * The WhatsApp group's history, as a CSV for Importar (PLAN R56; docs/runbooks/importing-the-whatsapp-history.md). Run
 * on the laptop that holds the export, never in the cluster:
 *
 *   pnpm whatsapp:csv --chat "<the export>.txt" --contacts "<Google Contacts>.csv" [--dates dmy|mdy] [--out <folder>]
 *
 * It writes importar-whatsapp.csv (a row per stay in the group, for Importar) and whatsapp-por-resolver.csv (whoever
 * it couldn't find a number or an email for) next to the export, or in --out. It prints counts only, never a name or a
 * number, and refuses to read or write inside this repository, which is public and keeps no personal data.
 */
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const { values } = (() => {
  try {
    return parseArgs({
      options: {
        chat: { type: 'string' },
        contacts: { type: 'string' },
        dates: { type: 'string' },
        out: { type: 'string' },
      },
    });
  } catch (error) {
    return fail(String(error instanceof Error ? error.message : error));
  }
})();

const chatPath =
  values.chat ??
  fail(
    'Usage: pnpm whatsapp:csv --chat <export.txt> --contacts <contacts.csv> [--dates dmy|mdy] [--out <folder>]',
  );
const outDir = values.out ?? dirname(chatPath);
for (const path of [chatPath, values.contacts, outDir]) {
  if (path !== undefined && !existsSync(path)) {
    fail(`Not found: ${path}`);
  }
  if (path !== undefined && isInside(ROOT, path)) {
    fail(
      'The export, the contacts and what this writes hold personal data: keep them out of this repository (CLAUDE.md).',
    );
  }
}
if (!statSync(outDir).isDirectory()) {
  fail(`Not a folder: ${outDir}`);
}
const dateOrder: DateOrder | undefined =
  values.dates === undefined
    ? undefined
    : values.dates === 'dmy' || values.dates === 'mdy'
      ? values.dates
      : fail('--dates is dmy (day first) or mdy (month first)');

let book: ContactBook;
try {
  book = contactBook(
    values.contacts === undefined ? [] : readGoogleContacts(readFileSync(values.contacts, 'utf8')),
  );
} catch (error) {
  if (error instanceof ContactsError) {
    fail(
      error.reason === 'unreadable'
        ? 'The contacts file is not a CSV.'
        : 'The contacts file is not a Google Contacts export (Google CSV): it has no name columns.',
    );
  }
  throw error;
}

let chat;
try {
  chat = parseChat(readFileSync(chatPath, 'utf8'), {
    ...(dateOrder ? { dateOrder } : {}),
    isName: (name) => book.byName(name).length > 0,
  });
} catch (error) {
  if (error instanceof ChatError) {
    fail(
      {
        notAnExport:
          'The chat file is not a WhatsApp export: no line starts with a date and a time.',
        ambiguousDates:
          'Every date could be day first or month first: say which with --dates dmy or --dates mdy.',
        mixedDates:
          'The dates are neither all day first nor all month first, or one is not a date.',
      }[error.reason],
    );
  }
  throw error;
}

const participants = participantsOf(chat.events);
const { rows, unresolved } = historyRows(participants, book);
const importPath = join(outDir, 'importar-whatsapp.csv');
const unresolvedPath = join(outDir, 'whatsapp-por-resolver.csv');
writeFileSync(importPath, importCsv(rows), { mode: 0o600 });
writeFileSync(unresolvedPath, unresolvedCsv(unresolved), { mode: 0o600 });

const people = new Set(rows.map((row) => row.phone || row.email));
const stillIn = participants.filter((one) => one.stays.at(-1)?.left === null).length;
const reasons = Object.entries(
  unresolved.reduce<Record<string, number>>((counts, one) => {
    counts[one.reason] = (counts[one.reason] ?? 0) + 1;
    return counts;
  }, {}),
)
  .map(([reason, count]) => `${reason} ${count}`)
  .join(', ');

console.log(`Read ${chat.lines} lines, dates ${chat.dateOrder === 'dmy' ? 'day' : 'month'} first.`);
console.log(
  `In the history: ${participants.length} people, ${stillIn} still in the group and ${participants.length - stillIn} gone.`,
);
console.log(
  `For Importar: ${rows.length} rows (stays), ${people.size} people, ${rows.filter((row) => row.name === '').length} rows without a name -> ${importPath}`,
);
console.log(
  `To resolve by hand: ${unresolved.length}${reasons ? ` (${reasons})` : ''} -> ${unresolvedPath}`,
);
console.log(
  `Left out: ${chat.aboutYou} lines about you, ${chat.unknown} system lines not recognised.`,
);
