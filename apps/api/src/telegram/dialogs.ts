import * as z from 'zod';

/**
 * A conversation in progress with the bot (ADR-0004), kept in private.telegram_dialogs for an hour:
 *
 * - `alta`: an arrival being reported. What was read so far, the step it waits on, the candidates it offered, and
 *   the reporter's messages that held a phone or email, deleted once the arrival is saved.
 * - `baja`: a leave being reported, waiting for a name or a phone to search, then for a choice.
 *
 * Read back through a schema: a dialog that isn't one any more (written by an older version) is dropped, never
 * trusted.
 */
const altaSchema = z.object({
  kind: z.literal('alta'),
  chatId: z.number().int(),
  /** The message that started it: the arrival's external id (`tg:<chat>:<message>`), so saving it twice is once. */
  startedBy: z.number().int(),
  step: z.enum(['name', 'contact', 'confirm']),
  name: z.string().max(200).optional(),
  phones: z.array(z.string().max(20)).max(10),
  emails: z.array(z.string().max(254)).max(10),
  chat: z.string().max(100).optional(),
  note: z.string().max(4000).optional(),
  /** The reporter said there is no phone or email to give. */
  noContact: z.boolean().optional(),
  candidates: z.array(z.uuid()).max(10).optional(),
  contactMessages: z.array(z.number().int()).max(20),
});

const bajaSchema = z.object({
  kind: z.literal('baja'),
  chatId: z.number().int(),
  step: z.enum(['search', 'pick']),
  options: z.array(z.uuid()).max(10).optional(),
  contactMessages: z.array(z.number().int()).max(20),
});

const dialogSchema = z.discriminatedUnion('kind', [altaSchema, bajaSchema]);

export type AltaDialog = z.infer<typeof altaSchema>;
export type BajaDialog = z.infer<typeof bajaSchema>;
export type Dialog = z.infer<typeof dialogSchema>;

export const readDialog = (state: unknown): Dialog | undefined => {
  const parsed = dialogSchema.safeParse(state);
  return parsed.success ? parsed.data : undefined;
};
