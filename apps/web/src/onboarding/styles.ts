import { css } from '@styled-system/css';

import { focusRing } from '@/ui/styles';

/** The onboarding pages' own look, on top of ui/styles: lists of people, the board, chips. Mobile first. */

/** A list of people, one card a row: the whole card is no link, so its buttons stay buttons. */
export const personList = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  listStyle: 'none',
  marginBlockEnd: '6',
});

export const personItem = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  padding: '4',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
});

export const personHead = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '2',
});

export const personName = css({
  fontSize: 'lg',
  fontWeight: 'bold',
  color: 'fg.default',
  textDecoration: 'underline',
  textUnderlineOffset: '0.2em',
  overflowWrap: 'anywhere',
  _focusVisible: focusRing,
});

/** A person's facts on one line that wraps: stage, owner, next action, community. */
export const meta = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2',
  alignItems: 'center',
  color: 'fg.muted',
  fontSize: 'sm',
  listStyle: 'none',
});

/** A stage, in words, with a solid outline: the same weight for every stage, never a colour of its own. */
export const stage = css({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '7',
  paddingInline: '2',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'sm',
  color: 'fg.default',
  fontWeight: 'bold',
  fontSize: 'sm',
});

/** An attention reason: its mark, its words, and the attention colours behind. */
export const reason = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  minHeight: '7',
  paddingInline: '2',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.attention',
  borderRadius: 'md',
  bg: 'bg.attention',
  color: 'fg.attention',
  fontSize: 'sm',
});

export const reasons = css({ display: 'flex', flexWrap: 'wrap', gap: '2', listStyle: 'none' });

/** An overdue date: bold, its mark and its words, as well as the colour. */
export const overdue = css({ color: 'fg.attention', fontWeight: 'bold' });

/** The filters: one column on a phone, a row of fields from a tablet up. */
export const filters = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
  gap: '4',
  padding: '4',
  marginBlockEnd: '6',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.subtle',
  '& > [data-wide]': { gridColumn: { md: '1 / -1' } },
});

export const select = css({
  minHeight: '11',
  paddingInline: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'md',
  bg: 'bg.canvas',
  color: 'fg.default',
  fontSize: 'md',
  _focusVisible: focusRing,
});

export const textarea = css({
  minHeight: '24',
  padding: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'md',
  bg: 'bg.canvas',
  color: 'fg.default',
  fontSize: 'md',
  _focusVisible: focusRing,
  '&[aria-invalid=true]': { borderWidth: '3px' },
});

/** The board: on a phone, a stage picker and one list (boardColumns hidden); from a tablet, columns side by side. */
export const boardColumns = css({
  display: { base: 'none', md: 'grid' },
  gridAutoFlow: 'column',
  gridAutoColumns: '18rem',
  gap: '4',
  overflowX: 'auto',
  paddingBlockEnd: '4',
  marginBlockEnd: '6',
});

export const boardColumn = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  padding: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.subtle',
  minHeight: '12rem',
});

export const boardPhone = css({ display: { base: 'block', md: 'none' } });

export const boardCard = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  padding: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.canvas',
});

/** A person's page: the main column, and the quick actions beside it from a wide screen up. */
export const personPage = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', lg: 'minmax(0, 3fr) minmax(0, 2fr)' },
  gap: { base: '6', lg: '8' },
  alignItems: 'start',
});

export const section = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  padding: '4',
  marginBlockEnd: '6',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
});

export const timeline = css({
  display: 'flex',
  flexDirection: 'column',
  listStyle: 'none',
  '& > li': {
    paddingBlock: '3',
    borderBlockEndWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'border.subtle',
  },
});

export const timelineBody = css({
  marginBlockStart: '1',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

/** A counts list: each count with its words. */
export const counts = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: '3',
  rowGap: '1',
  '& dt': { color: 'fg.muted' },
  '& dd': { margin: '0', fontWeight: 'bold' },
});

/** A group of radio choices, each a 44px target with its label beside it. */
export const choices = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  border: 'none',
  padding: '0',
  margin: '0',
  '& legend': { fontWeight: 'bold', marginBlockEnd: '1' },
  '& label': {
    display: 'flex',
    alignItems: 'center',
    gap: '3',
    minHeight: '11',
    cursor: 'pointer',
  },
  '& input': { width: '5', height: '5', accentColor: 'fg.default', _focusVisible: focusRing },
});

/** A pair of fields side by side from a tablet up (a date beside its text). */
export const pair = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', md: 'minmax(0, 2fr) minmax(0, 1fr)' },
  gap: '4',
});
