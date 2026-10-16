/**
 * A person's name as the pages show it: someone saved with only a phone or an email (PLAN R37) has none until staff
 * learn it, and shows as "Sin nombre" (`people.noName`), never as an empty space.
 */
export const personName = (name: string | null | undefined, noName: string): string =>
  name?.trim() || noName;
