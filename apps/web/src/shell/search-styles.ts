import { css } from '@styled-system/css';

import { focusRing } from '@/ui/styles';

/** The search from anywhere (PLAN R80): its button in the header, and the dialog it opens. */

export const button = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  minHeight: '11',
  paddingInline: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.canvas',
  color: 'fg.muted',
  cursor: 'pointer',
  flex: { base: '1 1 auto', md: '0 1 18rem' },
  _hover: { borderColor: 'border.default', color: 'fg.default' },
  _focusVisible: focusRing,
});

/** "Ctrl K" or "⌘K": said to everyone, shown only where there's a keyboard to press it on. */
export const keys = css({
  display: { base: 'none', md: 'inline' },
  marginInlineStart: 'auto',
  paddingInline: '1.5',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'sm',
  fontSize: 'xs',
});

export const backdrop = css({
  position: 'fixed',
  inset: '0',
  zIndex: 30,
  backgroundColor: 'rgb(0 0 0 / 0.4)',
});

export const positioner = css({
  position: 'fixed',
  inset: '0',
  zIndex: 31,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: { base: '2', md: '4' },
  paddingBlockStart: { base: '2', md: '12vh' },
});

export const content = css({
  display: 'flex',
  flexDirection: 'column',
  width: 'min(42rem, 100%)',
  maxHeight: { base: 'calc(100dvh - 1rem)', md: '70vh' },
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'lg',
  bg: 'bg.canvas',
  boxShadow: 'xl',
  overflow: 'hidden',
});

export const input = css({
  minHeight: '14',
  paddingInline: '4',
  border: 'none',
  borderBlockEndWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  fontSize: 'lg',
  outline: 'none',
  bg: 'transparent',
  color: 'fg.default',
});

export const list = css({
  flex: '1',
  overflowY: 'auto',
  listStyle: 'none',
  margin: '0',
  padding: '2',
  '& ul': { listStyle: 'none', margin: '0', padding: '0' },
});

export const groupLabel = css({
  paddingInline: '2',
  paddingBlockStart: '3',
  paddingBlockEnd: '1',
  color: 'fg.muted',
  fontSize: 'sm',
  fontWeight: 'bold',
});

/** An option: the one the arrows are on boxed and shaded, never by colour alone. */
export const option = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  minHeight: '11',
  paddingInline: '2',
  borderRadius: 'md',
  cursor: 'pointer',
  '&[aria-selected=true]': {
    bg: 'bg.subtle',
    outline: '2px solid',
    outlineColor: 'fg.default',
    outlineOffset: '-2px',
  },
});

export const detail = css({ color: 'fg.muted', fontSize: 'sm', textAlign: 'end' });

export const footer = css({
  paddingInline: '4',
  paddingBlock: '2',
  borderBlockStartWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  color: 'fg.muted',
  fontSize: 'sm',
});

export const empty = css({ padding: '4', color: 'fg.muted' });
