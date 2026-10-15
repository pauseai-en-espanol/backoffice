import { css } from '@styled-system/css';

import { focusRing } from '@/ui/styles';

/** The outreach pages' own look, on top of ui/styles and onboarding/styles: the letter, its parts, the board. */

/** A letter as the recipient reads it: its own line breaks kept, long words wrapped, a measure that reads well. */
export const letter = css({
  padding: '4',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'md',
  bg: 'bg.canvas',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  lineHeight: 'relaxed',
  maxWidth: '70ch',
});

/** A template's text as written, its `{{fields}}` and all: the same, a little smaller. */
export const template = css({
  padding: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.subtle',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontSize: 'sm',
  maxWidth: '70ch',
});

/** A list a line per item, each with its mark in words (problems, warnings, sources). */
export const marked = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  listStyle: 'none',
  '& > li': { display: 'flex', gap: '2', alignItems: 'baseline', overflowWrap: 'anywhere' },
});

export const bullets = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  listStyle: 'disc',
  paddingInlineStart: '5',
  overflowWrap: 'anywhere',
});

/** A copy button and its "Copiado", which stays beside it, in words. */
export const copy = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  flexWrap: 'wrap',
});

export const copied = css({ fontWeight: 'bold', fontSize: 'sm' });

/** A heading that takes focus when the page moves on to another target. */
export const focusable = css({ _focusVisible: focusRing });

/** A board group's heading: the status in words and how many. */
export const groupHeading = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2',
  alignItems: 'baseline',
  fontSize: 'lg',
  fontWeight: 'bold',
  marginBlockStart: '6',
  marginBlockEnd: '2',
});

/** A large text field (a letter's body). */
export const bodyArea = css({ minHeight: '20rem', fontFamily: 'inherit', lineHeight: 'relaxed' });

/** Checkbox rows in a list to pick from (Añadir contactos). */
export const pickList = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  listStyle: 'none',
  maxHeight: '28rem',
  overflowY: 'auto',
  padding: '2',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
});
