import type { LucideIcon } from 'lucide-react';

import { css } from '@styled-system/css';

const glyph = css({ flex: 'none' });

/**
 * An icon beside its word (PLAN R61, ui/icons.ts): hidden from screen readers, sized to the text, never taking focus or
 * shrinking.
 */
export const Icon = ({ icon: Glyph, size = 16 }: { icon: LucideIcon; size?: number }) => (
  <Glyph aria-hidden="true" focusable="false" size={size} strokeWidth={2} className={glyph} />
);
