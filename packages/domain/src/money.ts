/**
 * Amounts of money as the books keep them (ADR-0006 decision 3): whole cents, euros only, as integers, so no sum ever
 * rounds. Written and read the Spanish way (accounting spec §2): `1.234,56 €`, a dot between thousands and a comma
 * before the cents.
 */

/** The most a line takes: 999.999.999,99 €, as the database's check (migration journal). */
export const MAX_CENTS = 99_999_999_999;

/**
 * Thousands with dots in groups of three (`1.234.567`) or no separator at all (`1234567`), then a comma and one or
 * two decimals, and an optional euro sign. A dot anywhere else, or a comma before thousands, isn't Spanish: `12.34`
 * could mean either, so it is refused rather than guessed.
 */
const AMOUNT = /^(?<units>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?<decimals>\d{1,2}))?$/u;

/**
 * The cents an amount written the Spanish way says: `1.234,56 €` is 123456. Spaces (a non-breaking one too) and the
 * euro sign around it are ignored. Undefined for anything else: a negative amount (a line's side says which way money
 * went), more than two decimals, or more than MAX_CENTS.
 */
export const parseEuros = (text: string): number | undefined => {
  const bare = text.replace(/\s+/gu, '').replace(/€$/u, '').replace(/^€/u, '');
  const match = AMOUNT.exec(bare);
  if (!match?.groups) {
    return undefined;
  }
  const units = (match.groups.units ?? '').replaceAll('.', '');
  const decimals = (match.groups.decimals ?? '').padEnd(2, '0');
  // However many digits: a number too large to be exact is far past MAX_CENTS anyway.
  const cents = Number(units) * 100 + Number(decimals);
  return cents <= MAX_CENTS ? cents : undefined;
};

/** Groups of three with dots, always: `es-ES` itself leaves four-digit amounts ungrouped (`1234,56`). */
const grouped = (units: bigint): string =>
  units.toString().replace(/\B(?=(?:\d{3})+(?!\d))/gu, '.');

/**
 * `1.234,56 €` for 123456 cents; `-1.234,56 €` for a negative balance. Takes a bigint too, as the database's sums
 * arrive.
 */
export const formatEuros = (cents: number | bigint): string => {
  const value = BigInt(cents);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${grouped(absolute / 100n)},${(absolute % 100n).toString().padStart(2, '0')} €`;
};

/** `1234,56` for 123456 cents: what a spreadsheet set to Spanish reads as a number (the books' CSV exports). */
export const formatEurosPlain = (cents: number | bigint): string => {
  const value = BigInt(cents);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${(absolute / 100n).toString()},${(absolute % 100n).toString().padStart(2, '0')}`;
};
