import { foldName, normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import { parse } from 'csv-parse/sync';

import { personName } from './whatsapp-history.js';

/**
 * A Google Contacts export ("Exportar", Google CSV), read for the WhatsApp group's history (PLAN R56): the export names
 * people as the exporting phone has them saved, without their number, and the numbers are here. Only names, phones
 * and emails are read; the rest of each contact is left alone.
 */

export interface Contact {
  /** The ways the phone may show the contact, fullest first: as saved, without prefix or middle name, surname first. */
  names: string[];
  /** Normalised (E.164), mobile ones first. */
  phones: string[];
  /** Normalised. */
  emails: string[];
}

export class ContactsError extends Error {
  constructor(readonly reason: 'unreadable' | 'notGoogleContacts') {
    super(reason);
  }
}

/** Mobile numbers are the ones on WhatsApp: a label saying so comes first. */
const MOBILE = /\b(?:mobile|movil|cell|celular|whatsapp)\b/u;

export const readGoogleContacts = (text: string): Contact[] => {
  let records: string[][];
  try {
    records = parse(text, { bom: true, relax_column_count: true, skip_empty_lines: true });
  } catch {
    throw new ContactsError('unreadable');
  }
  const [header = [], ...rows] = records;
  const at = (...names: string[]) =>
    names.map((name) => header.indexOf(name)).find((i) => i !== -1);
  // Google's export since 2024, and the older one ("Google CSV" before that).
  const given = at('First Name', 'Given Name');
  const family = at('Last Name', 'Family Name');
  const full = at('Name');
  if (given === undefined && family === undefined && full === undefined) {
    throw new ContactsError('notGoogleContacts');
  }
  const middle = at('Middle Name', 'Additional Name');
  const prefix = at('Name Prefix');
  const suffix = at('Name Suffix');
  const nickname = at('Nickname');
  const fileAs = at('File As');
  const organisation = at('Organization Name', 'Organization 1 - Name');
  const phoneColumns = header.flatMap((name, index) => {
    const match = /^(Phone \d+) - Value$/u.exec(name);
    if (!match) {
      return [];
    }
    const label = [
      header.indexOf(`${match[1]} - Label`),
      header.indexOf(`${match[1]} - Type`),
    ].find((i) => i !== -1);
    return [{ index, label }];
  });
  const emailColumns = header.flatMap((name, index) =>
    /^E-mail \d+ - Value$/u.test(name) ? [index] : [],
  );

  return rows.map((row) => {
    const cell = (index: number | undefined) =>
      index === undefined ? '' : (row[index] ?? '').trim();
    // A cell may hold several values, " ::: " between them.
    const many = (index: number) =>
      cell(index)
        .split(' ::: ')
        .map((value) => value.trim());
    const join = (...parts: string[]) => parts.filter((part) => part !== '').join(' ');
    const names = [
      join(cell(prefix), cell(given), cell(middle), cell(family), cell(suffix)),
      join(cell(given), cell(middle), cell(family)),
      join(cell(given), cell(family)),
      join(cell(family), cell(given)),
      cell(full),
      cell(nickname),
      cell(fileAs),
    ].filter((name) => name !== '');
    if (names.length === 0 && cell(organisation) !== '') {
      names.push(cell(organisation));
    }
    const phones = phoneColumns
      .flatMap(({ index, label }) =>
        many(index).map((raw) => ({
          phone: normalizePhone(raw),
          mobile: MOBILE.test(foldName(cell(label))),
        })),
      )
      .sort((a, b) => Number(b.mobile) - Number(a.mobile))
      .flatMap(({ phone }) => (phone === undefined ? [] : [phone]));
    const emails = emailColumns.flatMap((index) =>
      many(index).flatMap((raw) => {
        const email = normalizeEmail(raw);
        return email === undefined ? [] : [email];
      }),
    );
    return {
      names: [...new Set(names)],
      phones: [...new Set(phones)],
      emails: [...new Set(emails)],
    };
  });
};

/** Finding a contact by how the export names them, or by a number. */
export interface ContactBook {
  byName: (name: string) => Contact[];
  byPhone: (phone: string) => Contact[];
}

/**
 * Names are compared folded (case, accents and anything but letters and digits), as the phone shows them, and then
 * without what people add in brackets, for a contact saved differently on the phone than in Google.
 */
export const contactBook = (contacts: readonly Contact[]): ContactBook => {
  const names = new Map<string, Set<Contact>>();
  const bare = new Map<string, Set<Contact>>();
  const phones = new Map<string, Set<Contact>>();
  const add = (map: Map<string, Set<Contact>>, key: string, contact: Contact) => {
    if (key !== '') {
      map.set(key, (map.get(key) ?? new Set()).add(contact));
    }
  };
  for (const contact of contacts) {
    for (const name of contact.names) {
      add(names, foldName(name), contact);
      add(bare, foldName(personName(name)), contact);
    }
    for (const phone of contact.phones) {
      add(phones, phone, contact);
    }
  }
  return {
    byName: (name) => [
      ...(names.get(foldName(name)) ?? bare.get(foldName(personName(name))) ?? new Set()),
    ],
    byPhone: (phone) => [...(phones.get(phone) ?? new Set())],
  };
};
