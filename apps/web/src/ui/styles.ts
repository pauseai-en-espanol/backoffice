import { css } from '@styled-system/css';

/**
 * The signed-in screens' look: the preset's colours by role only (packages/ui), 44px
 * controls and a visible focus ring (WCAG 2.2 AA), states marked in words or shapes as well as colour. Mobile first:
 * most reporting happens from a phone.
 */

export const focusRing = {
  outline: '3px solid',
  outlineColor: 'fg.default',
  outlineOffset: '2px',
} as const;

/** Hidden until focused: the first stop for keyboard users, past the header and navigation. */
export const skipLink = css({
  position: 'absolute',
  insetInlineStart: '2',
  insetBlockStart: '-20',
  zIndex: 10,
  paddingInline: '4',
  paddingBlock: '2',
  bg: 'bg.inverse',
  color: 'fg.inverse',
  fontWeight: 'bold',
  _focusVisible: { ...focusRing, insetBlockStart: '2', outlineColor: 'fg.default' },
});

export const header = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  paddingInline: { base: '4', md: '6' },
  paddingBlock: '3',
  borderBlockEndWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
});

export const productLink = css({
  fontWeight: 'bold',
  fontSize: 'lg',
  color: 'fg.default',
  textDecoration: 'none',
  _hover: { textDecoration: 'underline' },
  _focusVisible: focusRing,
});

export const muted = css({ color: 'fg.muted' });

export const nav = css({
  paddingInline: { base: '4', md: '6' },
  borderBlockEndWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  bg: 'bg.subtle',
});

/**
 * The sections: on a phone a menu that opens under its button (NavMenu), one section a line; from a tablet up a row
 * that wraps, always shown.
 */
export const navList = css({
  display: { base: 'none', md: 'flex' },
  flexDirection: { base: 'column', md: 'row' },
  flexWrap: { base: 'nowrap', md: 'wrap' },
  paddingBlock: '1',
  gap: '1',
  listStyle: 'none',
  '&[data-open="true"]': { display: 'flex' },
  '& > li': { flexShrink: '0' },
});

/** The phone's menu button; from a tablet up the sections are always shown, and it is not. */
export const menuButton = css({
  display: { base: 'inline-flex', md: 'none' },
  alignItems: 'center',
  gap: '2',
  minHeight: '11',
  paddingInline: '3',
  bg: 'transparent',
  color: 'fg.default',
  fontWeight: 'bold',
  cursor: 'pointer',
  _focusVisible: focusRing,
});

/** The current section is marked by a thick underline and bold text, besides aria-current. */
export const navLink = css({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '11',
  paddingInline: '3',
  whiteSpace: 'nowrap',
  color: 'fg.default',
  textDecoration: 'none',
  borderBlockEndWidth: '3px',
  borderStyle: 'solid',
  borderColor: 'transparent',
  bg: 'transparent',
  cursor: 'pointer',
  _hover: { textDecoration: 'underline' },
  _focusVisible: focusRing,
  '&[aria-current="page"]': { fontWeight: 'bold', borderColor: 'border.default' },
});

export const main = css({
  maxWidth: '72rem',
  marginInline: 'auto',
  paddingInline: { base: '4', md: '6' },
  paddingBlock: { base: '6', md: '10' },
  _focusVisible: { outline: 'none' },
});

/** A single narrow column, for the pages outside the app's shell (no access, not found). */
export const narrow = css({
  maxWidth: '40rem',
  marginInline: 'auto',
  paddingInline: '4',
  paddingBlock: { base: '10', md: '16' },
});

export const h1 = css({
  fontSize: '2xl',
  fontWeight: 'bold',
  lineHeight: 'tight',
  marginBlockEnd: '3',
  _focusVisible: focusRing,
});

export const h2 = css({
  fontSize: 'xl',
  fontWeight: 'bold',
  marginBlockStart: '8',
  marginBlockEnd: '3',
});

export const h3 = css({ fontSize: 'lg', fontWeight: 'bold', marginBlockEnd: '2' });

export const text = css({ color: 'fg.muted', marginBlockEnd: '4', maxWidth: '65ch' });

export const link = css({
  color: 'fg.default',
  textDecoration: 'underline',
  textUnderlineOffset: '0.2em',
  _focusVisible: focusRing,
});

export const linkList = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4',
  listStyle: 'none',
  '& a': { display: 'inline-flex', alignItems: 'center', minHeight: '11' },
});

export const card = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  padding: '4',
  marginBlockEnd: '6',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  maxWidth: '65ch',
});

/** A list of cards (the team, the invitations): one column on a phone, two from a wide screen. */
export const cardList = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
  gap: '4',
  listStyle: 'none',
  marginBlockEnd: '6',
  '& > li': { marginBlockEnd: '0', maxWidth: 'none' },
});

/** A card's facts, one per line: label and value. */
export const facts = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: '3',
  rowGap: '1',
  '& dt': { color: 'fg.muted' },
  '& dd': { margin: '0', overflowWrap: 'anywhere' },
});

/** A note that stands out from the text: bordered and marked in words, never by colour alone. */
export const notice = css({
  padding: '3',
  marginBlockEnd: '6',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border.info',
  borderRadius: 'md',
  bg: 'bg.info',
  color: 'fg.default',
  maxWidth: '65ch',
});

export const tableWrap = css({ overflowX: 'auto', marginBlockEnd: '6' });

export const table = css({
  width: '100%',
  borderCollapse: 'collapse',
  '& th, & td': {
    textAlign: 'start',
    verticalAlign: 'top',
    paddingInline: '3',
    paddingBlock: '3',
    borderBlockEndWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'border.subtle',
  },
  '& th': { fontWeight: 'bold' },
  '& thead th': { borderColor: 'border.default' },
  '& caption': { textAlign: 'start', fontWeight: 'bold', marginBlockEnd: '2' },
});

/** A table column shown only from tablet width up: on a phone, what it holds goes under the row's name instead. */
export const wideColumn = css({ display: { base: 'none', md: 'table-cell' } });

/** The phone's copy of what a `wideColumn` holds, under the row's name: small, on a line of its own. */
export const narrowOnly = css({
  display: { base: 'block', md: 'none' },
  fontWeight: 'normal',
  fontSize: 'sm',
  color: 'fg.muted',
  overflowWrap: 'anywhere',
});

/** Read by screen readers, not shown (a table's caption the page's heading already shows). */
export const srOnly = css({ srOnly: true });

/** On a line of its own. */
export const block = css({ display: 'block' });

/** Text with long unbroken strings (an email address, a row id), which may wrap anywhere. */
export const breakAnywhere = css({ overflowWrap: 'anywhere' });

export const button = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2',
  minHeight: '11',
  paddingInline: '5',
  borderRadius: 'md',
  bg: 'bg.accent',
  color: 'fg.onAccent',
  fontWeight: 'bold',
  cursor: 'pointer',
  _focusVisible: focusRing,
  '&[aria-disabled="true"]': { cursor: 'progress', opacity: 0.7 },
});

export const secondaryButton = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2',
  minHeight: '11',
  paddingInline: '4',
  borderRadius: 'md',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  bg: 'bg.canvas',
  color: 'fg.default',
  fontWeight: 'bold',
  cursor: 'pointer',
  _focusVisible: focusRing,
  '&[aria-disabled="true"]': { cursor: 'progress', opacity: 0.7 },
});

/** A button that reads as a link: still a target of 44 px (WCAG 2.5.8). */
export const textButton = css({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '11',
  padding: '0',
  bg: 'transparent',
  color: 'fg.default',
  textDecoration: 'underline',
  textUnderlineOffset: '0.2em',
  cursor: 'pointer',
  _focusVisible: focusRing,
  '&[aria-disabled="true"]': { cursor: 'progress', opacity: 0.7 },
});

export const tags = css({ display: 'flex', flexWrap: 'wrap', gap: '2', listStyle: 'none' });

/** A role, or any short label: outlined, so it never depends on a fill colour. */
export const tag = css({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '8',
  paddingInline: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'full',
  fontSize: 'sm',
});

/** A status in words, with its mark and a status colour behind: never the colour alone. */
export const status = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  paddingInline: '2',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderRadius: 'md',
  fontSize: 'sm',
  '&[data-status="positive"]': {
    bg: 'bg.positive',
    color: 'fg.positive',
    borderColor: 'border.positive',
  },
  '&[data-status="attention"]': {
    bg: 'bg.attention',
    color: 'fg.attention',
    borderColor: 'border.attention',
  },
  '&[data-status="negative"]': {
    bg: 'bg.negative',
    color: 'fg.negative',
    borderColor: 'border.negative',
  },
  '&[data-status="info"]': { bg: 'bg.info', color: 'fg.info', borderColor: 'border.info' },
});

/** A row's actions: side by side while they fit, one under another when they don't. */
export const rowActions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2',
  alignItems: 'flex-start',
});

export const form = css({ display: 'flex', flexDirection: 'column', gap: '5', maxWidth: '40rem' });

export const field = css({ display: 'flex', flexDirection: 'column', gap: '1.5' });

export const label = css({ fontWeight: 'bold' });

export const hint = css({ color: 'fg.muted', fontSize: 'sm' });

export const input = css({
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
  '&[aria-invalid=true]': { borderWidth: '3px' },
});

export const fieldset = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  border: 'none',
  padding: '0',
  margin: '0',
  '& legend': { fontWeight: 'bold', marginBlockEnd: '1' },
});

/** A checkbox, its label beside it (a 44px target), and what it means under the label. */
export const checkbox = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: '3',
  alignItems: 'center',
  '& input': {
    width: '5',
    height: '5',
    accentColor: 'fg.default',
    cursor: 'pointer',
    _focusVisible: focusRing,
  },
  '& label': { display: 'flex', alignItems: 'center', minHeight: '11', cursor: 'pointer' },
});

export const checkboxHelp = css({
  gridColumn: '2',
  color: 'fg.muted',
  fontSize: 'sm',
  marginBlockEnd: '2',
});

/** An error the whole form shares: bordered and marked in words, never by colour alone. */
export const alert = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  padding: '3',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border.negative',
  borderRadius: 'md',
  bg: 'bg.negative',
  color: 'fg.default',
});

/** A form's success line: it takes focus after a change, so it shows the focus ring then. */
export const done = css({
  padding: '3',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border.positive',
  borderRadius: 'md',
  bg: 'bg.positive',
  color: 'fg.default',
  _focusVisible: focusRing,
});

/** A question asked in place before a change that matters (deactivate, revoke, delete). */
export const confirm = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  padding: '3',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border.attention',
  borderRadius: 'md',
  bg: 'bg.attention',
  maxWidth: '40rem',
  _focusVisible: focusRing,
});

export const pager = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4',
  '& a': { display: 'inline-flex', alignItems: 'center', minHeight: '11' },
});
