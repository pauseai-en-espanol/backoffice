import { randomInt } from 'node:crypto';

/** A Spanish mobile number nobody else in this run uses: fictional, never contacted. */
export const phone = () => `6${randomInt(10_000_000, 99_999_999)}`;

const SYLLABLES = [
  'ka',
  'lo',
  'mi',
  'ne',
  'ru',
  'sa',
  'ti',
  'vo',
  'be',
  'da',
  'fu',
  'go',
  'pe',
  'xi',
  'zo',
  'yu',
];

/**
 * A made-up name unlike any other in the database: the matcher would rightly send a name like an earlier run's to
 * the Bandeja as a possible duplicate.
 */
export const uniqueName = (): string => {
  const word = (length: number) =>
    Array.from({ length }, () => SYLLABLES[randomInt(SYLLABLES.length)] ?? 'ka').join('');
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  return `${capital(word(3))} ${capital(word(4))}`;
};
