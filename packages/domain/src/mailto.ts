/**
 * An email handover link (PLAN R77): `mailto:` with the subject and the message written, which opens the onboarder's
 * own mail app for them to send, as a WhatsApp link opens WhatsApp. Nothing is ever sent by the backoffice. Undefined
 * for anything that isn't an address. Some mail apps cut a very long link: the message can always be copied instead.
 */
export const mailtoLink = (
  email: string,
  { subject, body }: { subject?: string; body?: string },
): string | undefined => {
  const address = email.trim();
  if (!/^[^\s@<>"(),;:?&]+@[^\s@<>"(),;:?&]+$/u.test(address)) {
    return undefined;
  }
  const query = [
    subject?.trim() ? `subject=${encodeURIComponent(subject.trim())}` : '',
    body?.trim() ? `body=${encodeURIComponent(body.trim())}` : '',
  ].filter(Boolean);
  return `mailto:${address}${query.length === 0 ? '' : `?${query.join('&')}`}`;
};
