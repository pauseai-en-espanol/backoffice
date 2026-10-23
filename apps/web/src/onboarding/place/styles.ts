import { css } from '@styled-system/css';

import { focusRing } from '@/ui/styles';

/** The place pickers (PLAN R74): an input with its buttons inside one box, and its list below it. */

export const control = css({
  display: 'flex',
  alignItems: 'center',
  minHeight: '11',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'md',
  bg: 'bg.canvas',
  _focusWithin: focusRing,
});

export const input = css({
  flex: '1',
  minWidth: '0',
  minHeight: '11',
  paddingInline: '3',
  border: 'none',
  bg: 'transparent',
  color: 'fg.default',
  fontSize: 'md',
  outline: 'none',
});

/** The open-the-list and clear buttons: 44px to touch (WCAG 2.5.8 asks 24). */
export const iconButton = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '11',
  minHeight: '11',
  border: 'none',
  bg: 'transparent',
  color: 'fg.muted',
  cursor: 'pointer',
  _hover: { color: 'fg.default' },
  _focusVisible: focusRing,
  '&[hidden]': { display: 'none' },
});

export const positioner = css({ zIndex: 20 });

export const content = css({
  maxHeight: '18rem',
  overflowY: 'auto',
  paddingBlock: '1',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'md',
  bg: 'bg.canvas',
  boxShadow: 'md',
  _focusVisible: focusRing,
  '&[hidden]': { display: 'none' },
});

export const groupLabel = css({
  paddingInline: '3',
  paddingBlock: '1.5',
  color: 'fg.muted',
  fontSize: 'sm',
  fontWeight: 'bold',
});

/** An option: the highlighted one boxed and shaded, the chosen one ticked, never by colour alone. */
export const item = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '2',
  minHeight: '11',
  paddingInline: '3',
  cursor: 'pointer',
  '&[data-highlighted]': {
    bg: 'bg.subtle',
    outline: '2px solid',
    outlineColor: 'fg.default',
    outlineOffset: '-2px',
  },
  '&[data-state=checked]': { fontWeight: 'bold' },
});

export const empty = css({ paddingInline: '3', paddingBlock: '2', color: 'fg.muted' });

/** A place's fields side by side while they fit, each its own height (PLAN R75): never squeezed into one line. */
export const row = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
  gap: '4',
  alignItems: 'start',
});
