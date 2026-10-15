/**
 * A WhatsApp handover link (onboarding spec, WhatsApp handover links): `https://wa.me/<number>?text=<message>`, which
 * opens WhatsApp with the message ready for a person to send. Nothing is ever sent by the backoffice. The number is
 * E.164, written without its `+`. Undefined for anything that isn't one.
 */
export const whatsappLink = (phone: string, message = ''): string | undefined => {
  if (!/^\+[1-9]\d{6,14}$/u.test(phone)) {
    return undefined;
  }
  const text = message.trim();
  return `https://wa.me/${phone.slice(1)}${text === '' ? '' : `?text=${encodeURIComponent(text)}`}`;
};
