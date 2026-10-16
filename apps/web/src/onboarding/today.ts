import { NO_FILTERS, pageQuery } from './filters';

/** How many of the unassigned Hoy lists, oldest first (PLAN M5): the rest are a link away, not a long scroll. */
export const TODAY_UNASSIGNED = 10;

/**
 * Hoy's unassigned queue: its first people, and, when there are more than it shows, how many there are in all and
 * where Personas lists them: new and nobody's, Hoy's own rule (onboarding spec, "Sin asignar").
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
            href: `/personas${pageQuery({ ...NO_FILTERS, stages: ['new'], owner: 'none' })}`,
          }
        : undefined,
  };
};
