import { STAGE_TONES } from '@backoffice/ui/brand';
import { describe, expect, it } from 'vitest';

import { RELATIONSHIP_STAGES } from '@/outreach/types';

import {
  icons,
  MISSING_ICONS,
  NAV_ICONS,
  RELATIONSHIP_ICONS,
  RELATIONSHIP_TONE,
  STAGE_ICONS,
} from './icons';

describe("outreach's relationships are pills like the onboarding's stages (PLAN R67)", () => {
  it('gives every relationship stage an icon and one of the stage colours', () => {
    for (const stage of RELATIONSHIP_STAGES) {
      expect(RELATIONSHIP_ICONS[stage], stage).toBeDefined();
      expect(STAGE_TONES as readonly string[], stage).toContain(RELATIONSHIP_TONE[stage]);
    }
  });

  it('tells apart by their icon the ones that share a colour', () => {
    expect(new Set(RELATIONSHIP_STAGES.map((stage) => RELATIONSHIP_ICONS[stage])).size).toBe(
      RELATIONSHIP_STAGES.length,
    );
    expect(RELATIONSHIP_TONE.declined).not.toBe(RELATIONSHIP_TONE.ally);
  });
});

describe('the menu has one icon per section (PLAN R66)', () => {
  it('never uses one icon for two sections', () => {
    const glyphs = Object.values(NAV_ICONS);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('never borrows the icon of something a card says, which would mean two things', () => {
    const said = new Set<unknown>([
      ...Object.values(icons).filter((glyph) => glyph !== icons.inbox),
      ...Object.values(STAGE_ICONS),
      ...Object.values(MISSING_ICONS),
    ]);
    for (const [section, glyph] of Object.entries(NAV_ICONS)) {
      expect(said.has(glyph), section).toBe(false);
    }
  });
});
