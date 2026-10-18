/**
 * The Bandeja's comparison, cell by cell (PLAN R68): "igual" in green where a candidate agrees with what came in,
 * "distinto" in amber where both say something and it differs, and nothing where either says nothing or the row is no
 * comparison (the group, the owner, the summary). Words and icons say what the colour says.
 */
export type CellMatch = 'same' | 'different' | 'none';

/** What the comparison shows when a value is missing. */
export const NOTHING = '—';

export const cellMatch = (
  compared: boolean,
  same: boolean,
  brought: string,
  value: string,
): CellMatch =>
  same ? 'same' : compared && brought !== NOTHING && value !== NOTHING ? 'different' : 'none';
