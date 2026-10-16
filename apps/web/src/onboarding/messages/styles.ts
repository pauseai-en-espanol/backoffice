import { css } from '@styled-system/css';

/** Mensajes' own look, on top of ui/styles. */

/** A message as written or as it goes out: its lines kept, a long link broken to fit a phone. */
export const message = css({
  padding: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.subtle',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

/** What a message needs before it may be saved, each a line of its own. */
export const problems = css({ paddingInlineStart: '5', listStyle: 'disc' });

/** The messages of a purpose, one under another, in the order they're offered. */
export const list = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  listStyle: 'none',
  padding: '0',
  '& > li > article': { marginBlockEnd: '0' },
});
