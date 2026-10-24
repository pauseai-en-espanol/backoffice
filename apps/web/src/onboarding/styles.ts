import { css } from '@styled-system/css';

import { focusRing } from '@/ui/styles';

/** The onboarding pages' own look, on top of ui/styles: lists of people, the board, chips. Mobile first. */

/** A list of people, one card a row (Censo, the Bandeja): the whole card is no link, so its buttons stay buttons. */
export const personList = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  listStyle: 'none',
  marginBlockEnd: '6',
});

/**
 * Hoy's lists as a grid of cards (PLAN R62): as many columns as fit, one on a phone. The cards in a row share its
 * height, their action at the bottom.
 */
export const personGrid = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 19rem), 1fr))',
  gap: '3',
  listStyle: 'none',
  marginBlockEnd: '6',
});

/**
 * A person's card (PLAN R61): who they are and their stage, then their facts, the next step, other reasons and what is
 * missing, each in its own place. The card is no link, so its buttons stay buttons.
 */
export const personItem = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2.5',
  padding: '4',
  minWidth: '0',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.canvas',
  '&[data-compact]': { padding: '3', gap: '2' },
});

export const personHead = css({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '3',
});

export const personName = css({
  fontSize: 'lg',
  fontWeight: 'bold',
  color: 'fg.default',
  textDecoration: 'underline',
  textDecorationThickness: '1px',
  textUnderlineOffset: '0.2em',
  overflowWrap: 'anywhere',
  _hover: { textDecorationThickness: '2px' },
  _focusVisible: focusRing,
});

/** "Sin nombre": a placeholder, so it never looks like a name. */
export const nameless = css({ fontStyle: 'italic', fontWeight: 'semibold', color: 'fg.muted' });

/** The name and the province together, so the stage stays to their right while they wrap (PLAN M5, step 4). */
export const personTitle = css({ fontSize: 'lg', overflowWrap: 'anywhere', minWidth: '0' });

/** "(Madrid)" after a name: the same size, not bold, so the name still reads first. */
export const province = css({ fontWeight: 'normal', color: 'fg.default' });

/** The team's one-line summary of who someone is. */
export const summary = css({ color: 'fg.default', fontSize: 'sm', overflowWrap: 'anywhere' });

/** A person's facts with their icons, on lines that wrap: owner, where they came from, the community, the team. */
export const facts = css({
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: '4',
  rowGap: '1',
  color: 'fg.muted',
  fontSize: 'sm',
  listStyle: 'none',
  '& > li': { display: 'inline-flex', alignItems: 'center', gap: '1.5', minWidth: '0' },
});

/** A fact that asks for someone ("Sin asignar"): the attention ink, bold, and its icon and words. */
export const factAttention = css({ color: 'fg.attention', fontWeight: 'bold' });

/**
 * The next step, in a strip of its own: red with a crossed calendar when its day has passed, amber when it is today or
 * when someone needs one and has none; the words and icons say what the colour says.
 */
export const nextStep = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: '2',
  rowGap: '1',
  paddingBlock: '1.5',
  paddingInline: '2.5',
  borderRadius: 'md',
  bg: 'bg.subtle',
  color: 'fg.default',
  fontSize: 'sm',
  overflowWrap: 'anywhere',
  '&[data-tone=attention]': { bg: 'bg.attention', color: 'fg.attention', fontWeight: 'semibold' },
  '&[data-tone=negative]': { bg: 'bg.negative', color: 'fg.negative' },
  '&[data-tone=quiet]': { bg: 'transparent', paddingInline: '0', color: 'fg.muted' },
});

/** When the next step is due: at the strip's end, bold, never wrapping inside. */
export const nextStepWhen = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  marginInlineStart: 'auto',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
});

/** "Falta: correo · qué quiere hacer": last, small, each gap a dashed chip with its icon (PLAN M5, step 4). */
export const missing = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '1.5',
  color: 'fg.muted',
  fontSize: 'xs',
});

export const missingLabel = css({ fontWeight: 'bold' });

/** A missing detail: a dashed outline, which reads as "not there yet", with its icon and word. */
export const missingChip = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  paddingBlock: '0.5',
  paddingInlineStart: '1.5',
  paddingInlineEnd: '2',
  borderWidth: '1px',
  borderStyle: 'dashed',
  borderColor: 'fg.muted',
  borderRadius: 'full',
});

/** The list's own action on a card ("Me lo quedo"), at its end. */
export const cardFoot = css({
  display: 'flex',
  justifyContent: 'flex-end',
  marginBlockStart: 'auto',
});

/** A person's facts on one line that wraps, in words (a person's page). */
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

/** A tag (PLAN R61): a quiet outline with its icon and word, a fact that asks nothing ("Equipo"). Never coloured. */
export const teamTag = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  minHeight: '6',
  paddingInline: '1.5',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  borderRadius: 'sm',
  bg: 'bg.canvas',
  color: 'fg.default',
  fontSize: 'xs',
  fontWeight: 'semibold',
  whiteSpace: 'nowrap',
});

/**
 * A stage (PLAN R61): a round pill filled with its stage's colour, with its icon and its word, so it is never a colour
 * alone. Without one of the onboarding's stages (outreach's relationship stages, for now), an outline in words.
 */
export const stage = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1.5',
  minHeight: '7',
  paddingInlineStart: '2',
  paddingInlineEnd: '2.5',
  borderRadius: 'full',
  fontWeight: 'bold',
  fontSize: 'sm',
  whiteSpace: 'nowrap',
  flex: 'none',
  '&:not([data-tone])': {
    paddingInline: '2',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'border.default',
    borderRadius: 'sm',
    color: 'fg.default',
  },
  '&[data-tone=stageNew]': { bg: 'bg.stageNew', color: 'fg.stageNew' },
  '&[data-tone=stageContacting]': { bg: 'bg.stageContacting', color: 'fg.stageContacting' },
  '&[data-tone=stageWelcomed]': { bg: 'bg.stageWelcomed', color: 'fg.stageWelcomed' },
  '&[data-tone=stageActive]': { bg: 'bg.stageActive', color: 'fg.stageActive' },
  '&[data-tone=stageDormant]': { bg: 'bg.stageDormant', color: 'fg.stageDormant' },
  '&[data-tone=stageUnresponsive]': { bg: 'bg.stageUnresponsive', color: 'fg.stageUnresponsive' },
  '&[data-tone=stageClosed]': { bg: 'bg.stageClosed', color: 'fg.stageClosed' },
});

/**
 * A status (PLAN R61): a square chip filled with its colour, with its icon and its words. Amber asks someone to act,
 * red is late, green is done or matching, blue is for information.
 */
export const reason = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1.5',
  minHeight: '7',
  paddingInline: '2',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.attention',
  borderRadius: 'sm',
  bg: 'bg.attention',
  color: 'fg.attention',
  fontSize: 'sm',
  fontWeight: 'semibold',
  '&[data-tone=negative]': {
    borderColor: 'border.negative',
    bg: 'bg.negative',
    color: 'fg.negative',
  },
  '&[data-tone=positive]': {
    borderColor: 'border.positive',
    bg: 'bg.positive',
    color: 'fg.positive',
  },
  '&[data-tone=info]': { borderColor: 'border.info', bg: 'bg.info', color: 'fg.info' },
});

export const reasons = css({ display: 'flex', flexWrap: 'wrap', gap: '2', listStyle: 'none' });

/** An overdue date: bold, its icon and its words, as well as the colour. */
export const overdue = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  color: 'fg.attention',
  fontWeight: 'bold',
});

/** Personas as rows (PLAN R62): on a laptop, five columns that line up down the page; on a phone, each a card. */
const ROW_COLUMNS = 'minmax(0, 2fr) 10.5rem minmax(0, 1.3fr) minmax(0, 2fr) minmax(0, 2.4fr)';

/** The columns' names above the rows, from a tablet up: decoration, as each cell says its own name to a reader. */
export const rowHead = css({
  display: { base: 'none', md: 'grid' },
  gridTemplateColumns: ROW_COLUMNS,
  columnGap: '4',
  paddingInline: '3',
  paddingBlock: '2',
  borderBlockEndWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border.default',
  color: 'fg.muted',
  fontSize: 'xs',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const personRows = css({
  display: 'flex',
  flexDirection: 'column',
  gap: { base: '3', md: '0' },
  listStyle: 'none',
  marginBlockEnd: '6',
});

/** A person as a row: a card on a phone (the name and the stage on top), five cells from a tablet up. */
export const personRow = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  columnGap: '3',
  rowGap: '2',
  alignItems: 'start',
  padding: '4',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.canvas',
  '& > [data-wide]': { gridColumn: '1 / -1' },
  md: {
    gridTemplateColumns: ROW_COLUMNS,
    columnGap: '4',
    alignItems: 'center',
    paddingInline: '3',
    paddingBlock: '3',
    borderWidth: '0',
    borderBlockEndWidth: '1px',
    borderRadius: '0',
    '& > [data-wide]': { gridColumn: 'auto' },
  },
});

/** A cell's own name ("Falta"), shown on a phone's card; beside the columns' names, said only to a reader. */
export const rowLabel = css({ md: { srOnly: true } });

/** A cell of a few lines, its parts stacked. */
export const rowCell = css({ display: 'flex', flexDirection: 'column', gap: '1.5', minWidth: '0' });

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

/** A stage's icon in its colour, beside its word (the stage counters, PLAN R66). */
export const stageMark = css({
  display: 'inline-flex',
  color: 'fg.muted',
  '&[data-tone=stageNew]': { color: 'fg.stageNew' },
  '&[data-tone=stageContacting]': { color: 'fg.stageContacting' },
  '&[data-tone=stageWelcomed]': { color: 'fg.stageWelcomed' },
  '&[data-tone=stageActive]': { color: 'fg.stageActive' },
  '&[data-tone=stageDormant]': { color: 'fg.stageDormant' },
  '&[data-tone=stageUnresponsive]': { color: 'fg.stageUnresponsive' },
  '&[data-tone=stageClosed]': { color: 'fg.stageClosed' },
});

/**
 * Hoy's figures (PLAN R66): each a number above its words, the words first for a reader (dt before dd, the number
 * shown above by column-reverse). One in amber when it asks someone to act, with its words saying what.
 */
export const figures = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '3',
  marginBlockEnd: '4',
  '& > div': {
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: '0.5',
    minWidth: '10rem',
    paddingBlock: '3',
    paddingInline: '4',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'border.subtle',
    borderRadius: 'md',
  },
  '& > div[data-tone=attention]': { bg: 'bg.attention', borderColor: 'border.attention' },
  '& dt': { color: 'fg.muted', fontSize: 'sm' },
  '& > div[data-tone=attention] dt, & > div[data-tone=attention] dd': { color: 'fg.attention' },
  '& dd': {
    margin: '0',
    fontSize: '3xl',
    fontWeight: 'bold',
    lineHeight: '1.1',
    fontVariantNumeric: 'tabular-nums',
  },
});

/** A status chip that leads somewhere (Hoy's Bandeja, PLAN R66): blue, for information, with its icon and words. */
export const statusLink = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  minHeight: '11',
  paddingInline: '3',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.info',
  borderRadius: 'sm',
  bg: 'bg.info',
  color: 'fg.info',
  fontWeight: 'semibold',
  textDecoration: 'underline',
  textUnderlineOffset: '0.2em',
  marginBlockEnd: '4',
  _focusVisible: focusRing,
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
  // The cards' words for a reader are positioned (srOnly): held here, so the columns out of view scroll in this frame
  // and never widen the page.
  position: 'relative',
  paddingBlockEnd: '4',
  marginBlockEnd: '6',
});

/** A stage's column: its top rule in the stage's colour, under a header with its pill (PLAN R61). */
export const boardColumn = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  padding: '3',
  borderWidth: '1px',
  borderBlockStartWidth: '4px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  bg: 'bg.subtle',
  minHeight: '12rem',
  '&[data-tone=stageNew]': { borderBlockStartColor: 'border.stageNew' },
  '&[data-tone=stageContacting]': { borderBlockStartColor: 'border.stageContacting' },
  '&[data-tone=stageWelcomed]': { borderBlockStartColor: 'border.stageWelcomed' },
  '&[data-tone=stageActive]': { borderBlockStartColor: 'border.stageActive' },
  '&[data-tone=stageDormant]': { borderBlockStartColor: 'border.stageDormant' },
  '&[data-tone=stageUnresponsive]': { borderBlockStartColor: 'border.stageUnresponsive' },
  '&[data-tone=stageClosed]': { borderBlockStartColor: 'border.stageClosed' },
});

/** A column's header: the stage's pill and how many. */
export const boardHeading = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '2',
  fontSize: 'md',
  fontWeight: 'normal',
});

export const boardPhone = css({ display: { base: 'block', md: 'none' } });

/** A small card of its own (the merge's candidates on a person's page). */
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

/** Under a person's name (PLAN R65): their stage and the next step's strip side by side, wrapping on a phone. */
export const personStatus = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '2',
  maxWidth: '44rem',
  '& > p': { flex: '1 1 16rem' },
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

/** Contacto's details, one row each (PLAN R63). */
export const identityList = css({ display: 'flex', flexDirection: 'column', listStyle: 'none' });

/**
 * A phone, an email or a Discord username on one line: its kind's mark, the value, and what can be done with it at
 * the row's end ("Copiar", "Quitar"), wrapping under the value when there's no room. A row, not a box in the box.
 */
export const identityRow = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: '3',
  rowGap: '1',
  paddingBlock: '2',
  borderBlockEndWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
});

/** An icon beside its words: the text's size, never on its own. */
export const identityIcon = css({ width: '4', height: '4', flex: 'none', color: 'fg.muted' });

/** An icon inside a button, before its word. */
export const buttonIcon = css({ width: '4', height: '4', flex: 'none' });

/** At least 10rem before it shares its line: a long address sends the actions under it, not itself into pieces. */
export const identityValue = css({ flex: '1 1 10rem', minWidth: '0', overflowWrap: 'anywhere' });

export const identityActions = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '3',
  marginInlineStart: 'auto',
});

/** Adding one: its label, the field with "Añadir" beside it (bottoms aligned), then how it will be stored. */
export const identityForm = css({ display: 'flex', flexDirection: 'column', gap: '1.5' });

export const identityAdd = css({
  display: 'flex',
  gap: '2',
  alignItems: 'stretch',
  '& > input': { flex: '1', minWidth: '0' },
  '& > button': { flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '1.5' },
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

/** A group's name and total over its rows (the Panel's "Dónde viven", PLAN R84): shaded, and said in words. */
export const rowGroup = css({
  bg: 'bg.subtle',
  color: 'fg.muted',
  fontSize: 'sm',
});

/** A count with its bar before it (the Panel's "Por etapa", PLAN R66): every bar starts at the same edge. */
export const countWithBar = css({
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 'bold',
});

/**
 * A bar to scale, in its stage's ink: it shows what the number at its end says (PLAN R66). Its length is its share of
 * the longest (`--share`, 0 to 1) of a track that fits the screen, 4.5rem on a phone and 14rem from a tablet up;
 * every bar starts at its cell's edge.
 */
export const bar = css({
  display: 'inline-block',
  verticalAlign: 'middle',
  width: { base: 'calc(var(--share, 0) * 4.5rem)', md: 'calc(var(--share, 0) * 14rem)' },
  height: '3',
  marginInlineEnd: '2',
  borderRadius: 'sm',
  bg: 'fg.muted',
  '&[data-tone=stageNew]': { bg: 'fg.stageNew' },
  '&[data-tone=stageContacting]': { bg: 'fg.stageContacting' },
  '&[data-tone=stageWelcomed]': { bg: 'fg.stageWelcomed' },
  '&[data-tone=stageActive]': { bg: 'fg.stageActive' },
  '&[data-tone=stageDormant]': { bg: 'fg.stageDormant' },
  '&[data-tone=stageUnresponsive]': { bg: 'fg.stageUnresponsive' },
  '&[data-tone=stageClosed]': { bg: 'fg.stageClosed' },
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

/** "Escribirle" on a person's page (PLAN R77): the message, the ways to send it, and the question after. */
export const handover = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  flex: '1 1 20rem',
  padding: '4',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
  borderRadius: 'md',
  '& > p': { margin: '0' },
});

/** Hoy's "Recientes" (PLAN R79): who I last did something with, each a link beside their stage, side by side. */
export const recentList = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2',
  listStyle: 'none',
  padding: '0',
  margin: '0',
  '& > li': {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '2',
    paddingInline: '3',
    paddingBlock: '2',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'border.subtle',
    borderRadius: 'md',
  },
});
