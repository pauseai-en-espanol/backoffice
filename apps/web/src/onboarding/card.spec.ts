import { ATTENTION_REASONS, STAGES } from '@backoffice/domain/stages';
import { STAGE_TONES } from '@backoffice/ui/brand';
import { describe, expect, it } from 'vitest';

import { MISSING_ICONS, STAGE_ICONS, STAGE_TONE } from '@/ui/icons';

import { chipReasons, nextStepTone, ownerSlot, SHOWN_BY_SLOTS } from './card';

describe('a card says each fact once (PLAN R61)', () => {
  it('gives no chip to what a slot already shows, and keeps a chip for the rest', () => {
    expect(chipReasons([...ATTENTION_REASONS])).toEqual([
      'follow_up',
      'left_community',
      'possible_duplicate',
    ]);
    expect(chipReasons(['unassigned', 'no_next_step', 'action_due'])).toEqual([]);
    // One this version doesn't know yet still gets its chip ("Revisar").
    expect(chipReasons(['something_new'])).toEqual(['something_new']);
    expect(
      SHOWN_BY_SLOTS.every((reason) => (ATTENTION_REASONS as readonly string[]).includes(reason)),
    ).toBe(true);
  });

  it('puts "Sin asignar" in the owner slot only for someone waiting for one', () => {
    expect(ownerSlot({ displayName: 'Laura Ejemplo' }, ['unassigned'])).toEqual({
      kind: 'owner',
      name: 'Laura Ejemplo',
    });
    expect(ownerSlot(null, ['unassigned', 'no_next_step'])).toEqual({ kind: 'unassigned' });
    // Nobody's, but arrived long ago: no reason, so no alarm.
    expect(ownerSlot(null, [])).toEqual({ kind: 'none' });
  });

  it('colours the next step by its day, and asks for one only when the person needs one', () => {
    const today = '2026-10-18';
    expect(nextStepTone('Llamar', '2026-10-15', ['action_due'], today)).toBe('negative');
    expect(nextStepTone('Llamar', today, ['action_due'], today)).toBe('attention');
    expect(nextStepTone('Llamar', '2026-10-20', [], today)).toBe('plain');
    expect(nextStepTone('Llamar', null, [], today)).toBe('plain');
    expect(nextStepTone(null, null, ['no_next_step'], today)).toBe('attention');
    expect(nextStepTone(null, null, [], today)).toBe('quiet');
  });
});

describe('a stage is never a colour alone (PLAN R61)', () => {
  it('gives every stage an icon and one of the stage colours', () => {
    for (const stage of STAGES) {
      expect(STAGE_ICONS[stage], stage).toBeDefined();
      expect(STAGE_TONES as readonly string[], stage).toContain(STAGE_TONE[stage]);
    }
  });

  it('tells the open stages apart by colour too, and the closed ones by their icon', () => {
    const open = STAGES.filter((stage) => stage !== 'left' && stage !== 'discarded');
    expect(new Set(open.map((stage) => STAGE_TONE[stage])).size).toBe(open.length);
    expect(STAGE_TONE.left).toBe(STAGE_TONE.discarded);
    expect(STAGE_ICONS.left).not.toBe(STAGE_ICONS.discarded);
    expect(new Set(STAGES.map((stage) => STAGE_ICONS[stage])).size).toBe(STAGES.length);
  });

  it('gives what is missing an icon each', () => {
    expect(Object.keys(MISSING_ICONS).sort()).toEqual(['email', 'interests', 'phone', 'province']);
  });
});
