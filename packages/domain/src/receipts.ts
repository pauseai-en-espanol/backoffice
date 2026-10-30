/**
 * Receipts (ADR-0006 decision 7): a PDF or a photo, 10 MB at most, recognised by its first bytes, never by the name or
 * the type the browser claims.
 */

export const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

/** 10 MB, as the database's check (migration receipts). */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean =>
  bytes.length >= at + signature.length &&
  signature.every((byte, index) => bytes[at + index] === byte);

/** `%PDF-` */
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** `RIFF`, then the size, then `WEBP`. */
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** What a file is by its first bytes, among the types a receipt may be; undefined for anything else. */
export const receiptTypeOf = (bytes: Uint8Array): ReceiptType | undefined => {
  if (startsWith(bytes, PDF)) {
    return 'application/pdf';
  }
  if (startsWith(bytes, JPEG)) {
    return 'image/jpeg';
  }
  if (startsWith(bytes, PNG)) {
    return 'image/png';
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return 'image/webp';
  }
  return undefined;
};

/**
 * A file's name as kept and offered back on download: what the uploader called it, without folders, control
 * characters or anything past 255 characters; undefined if nothing is left.
 */
export const receiptFileName = (raw: string): string | undefined => {
  let kept = '';
  for (const char of raw.split(/[/\\]/u).pop() ?? '') {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x1f && code !== 0x7f) {
      kept += char;
    }
  }
  const name = kept.trim();
  return name === '' || name === '.' || name === '..' ? undefined : name.slice(0, 255);
};
