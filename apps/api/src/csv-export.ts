/**
 * A CSV cell as a spreadsheet will read it: quoted, with a leading `=`, `+`, `-`, `@`, tab or return defused, so an
 * exported name can never run as a formula on an admin's computer (PLAN R18).
 */
export const csvCell = (
  value: string | number | boolean | readonly string[] | null | undefined,
): string => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? value.join('; ')
        : String(value);
  const safe = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

/** A whole CSV file: a byte order mark (so a spreadsheet reads UTF-8), the header, the rows, CRLF line ends. */
export const csvText = (
  header: readonly string[],
  rows: readonly (readonly Parameters<typeof csvCell>[0][])[],
): string => `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
