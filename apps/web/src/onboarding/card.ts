import { dueState } from './format';

/**
 * What a person's card shows where (PLAN R61: one fact, one place). Pure, so the rules are tested apart from the
 * markup (card.spec.ts).
 */

/**
 * The reasons a card already shows in a slot of its own: "Sin asignar" where the owner goes, "Sin siguiente paso" and
 * a late or due step in the next step's strip. A chip for them would say the same thing twice.
 */
export const SHOWN_BY_SLOTS = ['unassigned', 'no_next_step', 'action_due'] as const;

/** The reasons left for chips under the card's slots: the ones no slot shows. */
export const chipReasons = (reasons: readonly string[]): string[] =>
  reasons.filter((reason) => !(SHOWN_BY_SLOTS as readonly string[]).includes(reason));

/** The owner slot: a name, "Sin asignar" when the person waits for someone (a reason), or "Sin responsable". */
export const ownerSlot = (
  owner: { displayName: string } | null,
  reasons: readonly string[],
): { kind: 'owner'; name: string } | { kind: 'unassigned' } | { kind: 'none' } =>
  owner !== null
    ? { kind: 'owner', name: owner.displayName }
    : reasons.includes('unassigned')
      ? { kind: 'unassigned' }
      : { kind: 'none' };

/**
 * The next step's strip: red when its day has passed, amber when it is today or when there is none and the person
 * needs one (a reason), quiet otherwise (a step for later, or none for someone who needs none, such as a Baja).
 */
export const nextStepTone = (
  nextAction: string | null,
  due: string | null,
  reasons: readonly string[],
  today: string,
): 'negative' | 'attention' | 'plain' | 'quiet' => {
  if (nextAction === null) {
    return reasons.includes('no_next_step') ? 'attention' : 'quiet';
  }
  if (due === null) {
    return 'plain';
  }
  const state = dueState(due, today);
  return state === 'overdue' ? 'negative' : state === 'today' ? 'attention' : 'plain';
};
