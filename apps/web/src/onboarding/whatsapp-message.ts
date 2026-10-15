import { whatsappLink } from '@backoffice/domain/whatsapp';

import { fill } from '@/fill';

import type { Identity } from './types';

/**
 * The WhatsApp handover (onboarding spec, WhatsApp handover links): a link that opens WhatsApp with a prepared
 * message, which the onboarder sends from their own number. Nothing is sent by the backoffice.
 */

/** How the message greets the person: their preferred name, else the first word of their full name. */
export const greetingName = (person: { preferredName: string | null; fullName: string }): string =>
  person.preferredName?.trim() || person.fullName.trim().split(/\s+/u)[0] || person.fullName;

/** The prepared message, from its template (`{name}`, `{me}`). */
export const whatsappMessage = (template: string, values: { name: string; me: string }): string =>
  fill(template, values);

const E164 = /^\+[1-9]\d{6,14}$/u;

/**
 * The link to open: to the person's phone (a checked one first), with the message ready. Without a phone of theirs,
 * the API's own handover (`whatsapp`: a wa.me link, or a number), with the message added when it has none. Undefined
 * when there's no number to write to.
 */
export const handoverLink = (
  person: { identities: readonly Identity[]; whatsapp: string | null },
  message: string,
): string | undefined => {
  const phones = person.identities.filter((identity) => identity.kind === 'phone');
  const phone = (phones.find((identity) => identity.verified) ?? phones[0])?.value;
  if (phone !== undefined && E164.test(phone)) {
    return whatsappLink(phone, message);
  }
  const given = person.whatsapp?.trim();
  if (!given) {
    return undefined;
  }
  if (E164.test(given)) {
    return whatsappLink(given, message);
  }
  if (/^https:\/\/wa\.me\/\d+(?:\?.*)?$/u.test(given)) {
    return given.includes('?') || message.trim() === ''
      ? given
      : `${given}?text=${encodeURIComponent(message.trim())}`;
  }
  return undefined;
};
