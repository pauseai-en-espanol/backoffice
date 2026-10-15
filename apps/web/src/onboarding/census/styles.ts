import { css } from '@styled-system/css';

/** The census's own look, on top of ui/styles and onboarding/styles. */

/** A short list read one item a line, each with its bullet (a person's skills, a list in Ajustes). */
export const bullets = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  listStyle: 'disc',
  paddingInlineStart: '5',
});
