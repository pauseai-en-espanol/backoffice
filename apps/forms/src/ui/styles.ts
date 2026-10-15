import { css } from '@styled-system/css';

/**
 * The census form's look, the staff screens' (apps/web) for what it shares with them: the preset's colours by role only
 * (packages/ui), 44px controls and a visible focus ring (WCAG 2.2 AA), states marked in words or shapes as well as
 * colour. Mobile first: most people open it from a WhatsApp message.
 */

export const focusRing = {
  outline: '3px solid',
  outlineColor: 'fg.default',
  outlineOffset: '2px',
} as const;

/** A single narrow column: every page of this app. */
export const narrow = css({
  maxWidth: '40rem',
  marginInline: 'auto',
  paddingInline: '4',
  paddingBlock: { base: '8', md: '14' },
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

export const text = css({ color: 'fg.muted', marginBlockEnd: '4', maxWidth: '65ch' });

export const link = css({
  color: 'fg.default',
  textDecoration: 'underline',
  textUnderlineOffset: '0.2em',
  _focusVisible: focusRing,
});

/** A note that stands out from the text: bordered and marked in words, never by colour alone. */
export const notice = css({
  padding: '3',
  marginBlockEnd: '6',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border.attention',
  borderRadius: 'md',
  bg: 'bg.attention',
  color: 'fg.default',
  fontWeight: 'bold',
  maxWidth: '65ch',
});

/** Read by screen readers, not shown. */
export const srOnly = css({ srOnly: true });

/**
 * The honeypot: off screen and out of the tab order, hidden from screen readers, so only a bot that fills in every
 * field finds it.
 */
export const trap = css({
  position: 'absolute',
  insetInlineStart: '-9999px',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
});

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
  alignSelf: 'flex-start',
  _focusVisible: focusRing,
  '&[aria-disabled="true"]': { cursor: 'progress', opacity: 0.7 },
});

export const form = css({ display: 'flex', flexDirection: 'column', gap: '5', maxWidth: '40rem' });

/** A group of fields under its heading (about you, contact, how to help, consent). */
export const section = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '5',
  border: 'none',
  padding: '0',
  margin: '0',
  '& > legend': {
    fontSize: 'xl',
    fontWeight: 'bold',
    marginBlockStart: '4',
    marginBlockEnd: '1',
  },
});

export const field = css({ display: 'flex', flexDirection: 'column', gap: '1.5' });

export const label = css({ fontWeight: 'bold' });

export const hint = css({ color: 'fg.muted', fontSize: 'sm' });

/** A field's problem, under it: in words, with a mark, besides the field's thicker border. */
export const fieldError = css({
  fontWeight: 'bold',
  fontSize: 'sm',
  color: 'fg.negative',
  '&::before': { content: '"✕ "' },
});

const control = {
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
  '&[aria-invalid=true]': { borderWidth: '3px', borderColor: 'border.negative' },
} as const;

export const input = css(control);

export const textarea = css({ ...control, minHeight: '24', paddingBlock: '2', resize: 'vertical' });

export const fieldset = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  border: 'none',
  padding: '0',
  margin: '0',
  '& legend': { fontWeight: 'bold', marginBlockEnd: '1' },
});

/** A checkbox or radio, its label beside it (a 44px target), and what it means under the label. */
export const choice = css({
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
  '& input[aria-invalid=true]': { outline: '3px solid', outlineColor: 'border.negative' },
  '& label': { display: 'flex', alignItems: 'center', minHeight: '11', cursor: 'pointer' },
});

/** Under a choice's label: its hint or its problem. */
export const choiceNote = css({ gridColumn: '2', marginBlockEnd: '2' });

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
  _focusVisible: focusRing,
  '& ul': { paddingInlineStart: '5', listStyle: 'disc' },
});

/** The answer was sent: it takes focus, so it shows the focus ring then. */
export const done = css({
  padding: '4',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: 'border.positive',
  borderRadius: 'md',
  bg: 'bg.positive',
  color: 'fg.default',
  fontWeight: 'bold',
  _focusVisible: focusRing,
});

/** The privacy notice's sections. */
export const prose = css({
  '& h2': { fontSize: 'lg', fontWeight: 'bold', marginBlockStart: '6', marginBlockEnd: '2' },
  '& p': { marginBlockEnd: '3', maxWidth: '65ch' },
});
