import { NO_FILTERS, pageQuery } from './filters';

/** How many of the unassigned Hoy lists, oldest first (PLAN M5): the rest are a link away, not a long scroll. */
export const TODAY_UNASSIGNED = 10;

/**
 * Hoy's unassigned queue: its first people, and, when there are more than it shows, how many there are in all and
 * where Personas lists them: by the reason itself, so the list is exactly the rule's (new, nobody's, arrived in the last
 * 30 days; onboarding spec, "Sin asignar").
 */
export const unassignedQueue = <T>(
  unassigned: readonly T[],
  total: number,
): { shown: readonly T[]; more: { count: number; href: string } | undefined } => {
  const shown = unassigned.slice(0, TODAY_UNASSIGNED);
  const count = Math.max(total, unassigned.length);
  return {
    shown,
    more:
      count > shown.length
        ? {
            count,
            href: `/personas${pageQuery({ ...NO_FILTERS, reason: 'unassigned' })}`,
          }
        : undefined,
  };
};

/**
 * Where Hoy's "Mis personas" leads (PLAN R70): always to everyone mine in Personas, since whoever needs nothing today
 * isn't on Hoy; and, when Hoy got fewer than it counted, to every one of mine that needs something, by the same rule.
 */
export const mineLinks = (
  shown: number,
  total: number,
): { all: string; pending: { count: number; href: string } | undefined } => ({
  all: `/personas${pageQuery({ ...NO_FILTERS, owner: 'me' })}`,
  pending:
    total > shown
      ? {
          count: total,
          href: `/personas${pageQuery({ ...NO_FILTERS, owner: 'me', attention: true })}`,
        }
      : undefined,
});
