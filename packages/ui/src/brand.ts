/**
 * The brand palette, from PauseAI's brand kit, and the greys around it (as aiontheballot). Pages use it through the
 * preset's semantic tokens only.
 *
 * Orange text on white fails WCAG AA (about 2.2:1): orange is a fill behind ink text, or text on ink.
 */
export const palette = {
  orange: '#FF9416',
  ink: '#111111',
  paper: '#FFFFFF',
  grey: {
    50: '#F4F4F3',
    200: '#D6D6D6',
    400: '#A8A8A8',
    700: '#4A4A4A',
    900: '#2A2A2A',
  },
  /** Pale fills for statuses. A status is never shown by colour alone: it also has an icon and a word. */
  tint: {
    attention: '#FFF1DC',
    positive: '#E3F4E8',
    negative: '#FBE4E4',
    info: '#E4EEFB',
  },
  /** Ink for each status, dark enough to read on its tint and on paper. */
  shade: {
    attention: '#7A3E00',
    positive: '#155A2B',
    negative: '#8A1C1C',
    info: '#1B4A84',
  },
} as const;

/**
 * The colours each surface uses, by role. They are the only colours pages use, so a dark mode means redefining these
 * and nothing else. Every text colour is checked against the backgrounds it sits on (contrast.spec.ts).
 */
export const roles = {
  bg: {
    canvas: palette.paper,
    subtle: palette.grey[50],
    inverse: palette.ink,
    accent: palette.orange,
    /** A solid fill drawn on the accent, such as its button. */
    onAccent: palette.ink,
    /** Behind a status's icon and words: a person needing attention, an error, a success, a notice. */
    attention: palette.tint.attention,
    positive: palette.tint.positive,
    negative: palette.tint.negative,
    info: palette.tint.info,
  },
  fg: {
    default: palette.ink,
    muted: palette.grey[700],
    onAccent: palette.ink,
    inverse: palette.paper,
    inverseMuted: palette.grey[200],
    inverseSubtle: palette.grey[400],
    accentOnInverse: palette.orange,
    /** Text on a fill drawn on the accent (bg.onAccent), and the accent itself as text there. */
    onAccentFill: palette.paper,
    accentOnFill: palette.orange,
    /** A status's words and icon, on its own fill or on the canvas. */
    attention: palette.shade.attention,
    positive: palette.shade.positive,
    negative: palette.shade.negative,
    info: palette.shade.info,
  },
  border: {
    default: palette.ink,
    subtle: palette.grey[200],
    inverse: palette.grey[900],
    /** Lines drawn on the accent: borders and focus rings. */
    onAccent: palette.ink,
    attention: palette.shade.attention,
    positive: palette.shade.positive,
    negative: palette.shade.negative,
    info: palette.shade.info,
  },
} as const;

/** Which text colours may sit on which backgrounds. */
export const textOn = {
  canvas: ['default', 'muted', 'attention', 'positive', 'negative', 'info'],
  subtle: ['default', 'muted', 'attention', 'positive', 'negative', 'info'],
  accent: ['onAccent'],
  inverse: ['inverse', 'inverseMuted', 'inverseSubtle', 'accentOnInverse'],
  onAccent: ['onAccentFill', 'accentOnFill'],
  attention: ['default', 'attention'],
  positive: ['default', 'positive'],
  negative: ['default', 'negative'],
  info: ['default', 'info'],
} as const satisfies Record<keyof typeof roles.bg, readonly (keyof typeof roles.fg)[]>;

/** The statuses, each with a fill, an ink and a border. */
export const STATUSES = ['attention', 'positive', 'negative', 'info'] as const;
export type Status = (typeof STATUSES)[number];

/**
 * PauseAI's typefaces (pauseai.info/press), self-hosted by each app, which sets these CSS variables. An app that
 * doesn't load them gets the system font.
 */
export const fontVariables = {
  display: '--font-display',
  body: '--font-body',
  numeric: '--font-numeric',
} as const;
