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

/** The name and the province together, so the stage stays to their right while they wrap (PLAN M5, step 4). */
export const personTitle = css({ fontSize: 'lg', overflowWrap: 'anywhere' });

/** "(Madrid)" after a name: the same size, not bold, so the name still reads first. */
export const province = css({ fontWeight: 'normal', color: 'fg.default' });

/** The team's one-line summary of who someone is. */
export const summary = css({ color: 'fg.default', overflowWrap: 'anywhere' });

/** "Falta: correo · qué quiere hacer": in words, never only a colour. */
export const missing = css({ color: 'fg.default', fontSize: 'sm' });

export const missingLabel = css({ fontWeight: 'bold' });

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

/** A card's tags, side by side: "Equipo" and the stage. */
export const tags = css({
  display: 'inline-flex',
  flexWrap: 'wrap',
  gap: '2',
  alignItems: 'center',
});

/** "Equipo": a dashed outline, so it never reads as a stage; in words, never a colour alone. */
export const teamTag = css({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '7',
  paddingInline: '2',
  borderWidth: '2px',
  borderStyle: 'dashed',
  borderColor: 'border.default',
  borderRadius: 'sm',
  color: 'fg.default',
  fontSize: 'sm',
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

/** Personas' and the Pipeline's filters (PLAN R59): the search, "Más filtros", the counters and what is on. */
export const filterArea = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginBlockEnd: '6',
});

export const filterForm = css({ display: 'flex', flexDirection: 'column', gap: '3' });

/** The search box and its button, side by side. */
export const searchRow = css({
  display: 'flex',
  gap: '2',
  maxWidth: '40rem',
  '& input': { flex: '1 1 auto', minWidth: '0' },
});

/** "Más filtros": folded, its summary a 44px target that says how many are on. */
export const moreFilters = css({
  '& > summary': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2',
    minHeight: '11',
    cursor: 'pointer',
    fontWeight: 'bold',
    listStyle: 'none',
    _focusVisible: focusRing,
    _before: { content: '"▸"', width: '1em' },
  },
  '& > summary::-webkit-details-marker': { display: 'none' },
  '&[open] > summary': { marginBlockEnd: '3', _before: { content: '"▾"' } },
  '& > div': { marginBlockEnd: '0' },
});

/** A counter for each stage, which is also its filter: the chosen one bordered and bold, never by colour alone. */
export const stageCounters = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2',
  listStyle: 'none',
  '& a': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2',
    minHeight: '11',
    paddingInline: '3',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'border.subtle',
    borderRadius: 'full',
    color: 'fg.default',
    textDecoration: 'none',
    _hover: { borderColor: 'border.default' },
    _focusVisible: focusRing,
  },
  '& a[aria-current="page"]': {
    borderWidth: '2px',
    borderColor: 'fg.default',
    fontWeight: 'bold',
  },
});

/** A count beside its label. */
export const counter = css({ fontVariantNumeric: 'tabular-nums', color: 'fg.muted' });

/** What is on, each a link that takes it off, and the link that takes them all off. */
export const activeFilters = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: '3',
  rowGap: '2',
});

export const chips = css({ display: 'flex', flexWrap: 'wrap', gap: '2', listStyle: 'none' });

export const chip = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  minHeight: '11',
  paddingInline: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'full',
  bg: 'bg.subtle',
  color: 'fg.default',
  textDecoration: 'none',
  _focusVisible: focusRing,
});

/** How many a list has, above it, and what can be done with it. */
export const listHead = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  marginBlockEnd: '4',
});

export const listCount = css({ fontWeight: 'bold', fontSize: 'lg' });

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
/** A person's page heading: who they are, and beside it (under it on a phone) what is done first. */
export const personHeader = css({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '6',
  marginBlockEnd: '6',
});

export const personHeading = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  flex: '1 1 24rem',
  minWidth: '0',
  '& h1': { marginBlockEnd: '0' },
});

/** "Me lo quedo" and WhatsApp, side by side. */
export const personActions = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  gap: '3',
  flex: '0 1 28rem',
  minWidth: '0',
  '& > *': { flex: '0 1 auto', minWidth: '0' },
});

/** Where someone is (stage, owner, next step): each label above its value on a phone, beside it from a tablet. */
export const followUp = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', md: 'auto minmax(0, 1fr)' },
  columnGap: '4',
  alignItems: 'baseline',
  '& dt': { color: 'fg.muted', fontWeight: 'bold' },
  '& dd': { margin: '0', marginBlockEnd: { base: '3', md: '1' } },
});

/** A phone, an email or a Discord username, with what can be done with it: a row, not a box in the box. */
export const identityRow = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5',
  paddingBlock: '2',
  borderBlockEndWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  _last: { borderBlockEndWidth: '0' },
});

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

/** Three short fields side by side from a tablet up (an attempt's channel, outcome and day). */
export const trio = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
  gap: '4',
  alignItems: 'start',
});

/** A field that needs no more width than a date. */
export const narrowField = css({ maxWidth: '20rem' });

/** A form's group of fields under its name ("Quién es", "Dónde vive"): no box, the name in bold. */
export const fieldGroup = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  border: 'none',
  padding: '0',
  margin: '0',
  '& legend': { fontWeight: 'bold', fontSize: 'lg', marginBlockEnd: '2' },
});

/** The same radio choices side by side, wrapping on a narrow screen (an attempt or a note). */
export const choicesRow = css({
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: '6',
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

/** "igual" in the Bandeja's comparison: in words, outlined, never by colour alone (PLAN R60). */
export const same = css({
  display: 'inline-block',
  paddingInline: '1.5',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'sm',
  fontSize: 'sm',
  whiteSpace: 'nowrap',
});

/** People found by a search, each with the button that picks them. */
export const foundList = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  listStyle: 'none',
  '& > li': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '2',
    paddingBlock: '2',
    borderBlockEndWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'border.subtle',
  },
});
