/**
 * Where a person is in onboarding (onboarding spec, stages). Identifiers are English, as in the database
 * (`app.stage`); labels are Spanish, in packages/i18n. The order is the expected path, which the board follows; any
 * stage can move to any other by hand.
 */
export const STAGES = [
  'to_triage',
  'new',
  'contacting',
  'talking',
  'welcomed',
  'active',
  'dormant',
  'unresponsive',
  'left',
  'discarded',
] as const;
export type Stage = (typeof STAGES)[number];

export const isStage = (value: unknown): value is Stage =>
  typeof value === 'string' && (STAGES as readonly string[]).includes(value);

/** Stages in which someone is being onboarded: each should have a next action. */
export const OPEN_STAGES: readonly Stage[] = ['new', 'contacting', 'talking', 'welcomed'];

/** Stages that close the next action: the person left or was discarded. */
export const CLOSED_STAGES: readonly Stage[] = ['left', 'discarded'];

export const isOpen = (stage: Stage): boolean => OPEN_STAGES.includes(stage);

/**
 * Why a person needs attention (onboarding spec, attention rules), in the order the card lists them. Computed on read
 * by the database (app.people_attention), never stored; the labels are in packages/i18n.
 */
export const ATTENTION_REASONS = [
  'unassigned',
  'action_due',
  'no_next_step',
  'follow_up',
  'left_community',
  'possible_duplicate',
] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export const isAttentionReason = (value: unknown): value is AttentionReason =>
  typeof value === 'string' && (ATTENTION_REASONS as readonly string[]).includes(value);

/** How a contact attempt was made, and how it went (the timeline's presets). */
export const CONTACT_CHANNELS = [
  'whatsapp',
  'phone',
  'email',
  'telegram',
  'in_person',
  'other',
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_OUTCOMES = [
  'no_answer',
  'replied',
  'left_message',
  'wrong_number',
  'declined',
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

/** Where we learned about a person. */
export const SOURCES = ['airtable', 'telegram', 'census', 'manual', 'csv'] as const;
export type Source = (typeof SOURCES)[number];
