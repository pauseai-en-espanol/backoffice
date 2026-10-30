import { describe, expect, it } from 'vitest';

import { receiptFileName, receiptTypeOf } from './receipts.js';

const bytes = (...values: (number | string)[]): Uint8Array =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === 'string' ? [...Buffer.from(value, 'latin1')] : [value],
    ),
  );

describe('receiptTypeOf', () => {
  it('recognises a PDF, a JPEG, a PNG and a WebP by their first bytes', () => {
    expect(receiptTypeOf(bytes('%PDF-1.7\n'))).toBe('application/pdf');
    expect(receiptTypeOf(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(receiptTypeOf(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(receiptTypeOf(bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses anything else, whatever it is called: a page, a script, another RIFF, too few bytes', () => {
    expect(receiptTypeOf(bytes('<html><script>'))).toBeUndefined();
    expect(receiptTypeOf(bytes('RIFF', 0x24, 0, 0, 0, 'WAVEfmt '))).toBeUndefined();
    expect(receiptTypeOf(bytes('%PD'))).toBeUndefined();
    expect(receiptTypeOf(bytes(0x89, 'PNG'))).toBeUndefined();
    expect(receiptTypeOf(new Uint8Array())).toBeUndefined();
  });
});

describe('receiptFileName', () => {
  it('keeps what the uploader called it, without folders or control characters', () => {
    expect(receiptFileName('factura-luz.pdf')).toBe('factura-luz.pdf');
    expect(receiptFileName('C:\\Users\\ejemplo\\ticket.jpg')).toBe('ticket.jpg');
    expect(receiptFileName('../../etc/passwd')).toBe('passwd');
    expect(receiptFileName('recibo\u0000\n.pdf')).toBe('recibo.pdf');
    expect(receiptFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(255);
  });

  it('refuses a name with nothing left', () => {
    expect(receiptFileName('')).toBeUndefined();
    expect(receiptFileName('carpeta/')).toBeUndefined();
    expect(receiptFileName('..')).toBeUndefined();
  });
});
