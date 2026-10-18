/**
 * The brand palette, from PauseAI's brand kit, and the greys around it. Pages use it through the
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
  /**
   * Each onboarding stage's fill and ink (PLAN R61): cool hues, so a stage never reads as a status (amber is to act, red
   * is late). A stage is never shown by colour alone: its pill also carries its icon and its word. The two closed
   * stages, Baja and Descartado, share a grey; their icons tell them apart.
   */
  stage: {
    new: { tint: '#E4EEFB', ink: '#1B4A84' },
    contacting: { tint: '#EEE8FB', ink: '#4B2C8F' },
    welcomed: { tint: '#DCF2EF', ink: '#0E5A53' },
    active: { tint: '#E3F4E8', ink: '#155A2B' },
    dormant: { tint: '#EDEDEB', ink: '#4A4A4A' },
    unresponsive: { tint: '#FBE6EE', ink: '#8A1F4A' },
    closed: { tint: '#EDEDEB', ink: '#2A2A2A' },
  },
} as const;

/** The stage colours' role names, one per hue (the web app maps each stage to one). */
export const STAGE_TONES = [
  'stageNew',
  'stageContacting',
  'stageWelcomed',
  'stageActive',
  'stageDormant',
  'stageUnresponsive',
  'stageClosed',
] as const;
export type StageTone = (typeof STAGE_TONES)[number];

const stageRoles = (part: 'tint' | 'ink') =>
  ({
    stageNew: palette.stage.new[part],
    stageContacting: palette.stage.contacting[part],
    stageWelcomed: palette.stage.welcomed[part],
    stageActive: palette.stage.active[part],
    stageDormant: palette.stage.dormant[part],
    stageUnresponsive: palette.stage.unresponsive[part],
    stageClosed: palette.stage.closed[part],
  }) as const satisfies Record<StageTone, string>;

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
    /** Behind a stage's icon and word (PLAN R61). */
    ...stageRoles('tint'),
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
    /** A stage's icon and word, on its own fill or on the canvas. */
    ...stageRoles('ink'),
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
    /** A stage's rule, such as the top of its column on the Onboarding Pipeline. */
    ...stageRoles('ink'),
  },
} as const;

const STAGE_INKS = STAGE_TONES;

/** Which text colours may sit on which backgrounds. */
export const textOn = {
  canvas: ['default', 'muted', 'attention', 'positive', 'negative', 'info', ...STAGE_INKS],
  subtle: ['default', 'muted', 'attention', 'positive', 'negative', 'info', ...STAGE_INKS],
  accent: ['onAccent'],
  inverse: ['inverse', 'inverseMuted', 'inverseSubtle', 'accentOnInverse'],
  onAccent: ['onAccentFill', 'accentOnFill'],
  attention: ['default', 'attention'],
  positive: ['default', 'positive'],
  negative: ['default', 'negative'],
  info: ['default', 'info'],
  stageNew: ['stageNew'],
  stageContacting: ['stageContacting'],
  stageWelcomed: ['stageWelcomed'],
  stageActive: ['stageActive'],
  stageDormant: ['stageDormant'],
  stageUnresponsive: ['stageUnresponsive'],
  stageClosed: ['stageClosed'],
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
