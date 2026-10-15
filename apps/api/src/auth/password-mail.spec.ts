import { describe, expect, it } from 'vitest';

import type { MailMessage } from '../mail/mailer.js';

import { createPasswordMail } from './password-mail.js';

const capture = () => {
  const sent: MailMessage[] = [];
  const mail = createPasswordMail({
    mailer: { send: async (message) => void sent.push(message) },
    staffOrigin: 'https://backoffice.example.test',
    productName: 'Backoffice de ejemplo',
  });
  return { sent, mail };
};

describe('password mail', () => {
  it('sends a link that carries its token in the fragment, in the product name', async () => {
    const { sent, mail } = capture();
    await mail.link({ email: 'ana@ejemplo.test', token: 'tok/en' });
    expect(sent[0]).toMatchObject({ to: 'ana@ejemplo.test', fromName: 'Backoffice de ejemplo' });
    expect(sent[0]?.text).toContain(
      'https://backoffice.example.test/nueva-contrasena#token=tok%2Fen',
    );
    expect(sent[0]?.subject).toContain('Backoffice de ejemplo');
  });

  it('names the admin who sent it, as plain text, or says someone did when the name is blank', async () => {
    const { sent, mail } = capture();
    await mail.link({
      email: 'ana@ejemplo.test',
      token: 't',
      by: { name: 'Luis https://malo.example\nPérez' },
    });
    await mail.link({ email: 'ana@ejemplo.test', token: 't', by: { name: '  ' } });
    expect(sent[0]?.text).toContain('Luis Pérez, que administra');
    expect(sent[0]?.text).not.toContain('malo.example');
    expect(sent[1]?.text).toContain('Alguien, que administra');
  });

  it('tells the account its password changed, with where to choose another', async () => {
    const { sent, mail } = capture();
    await mail.changed({ email: 'ana@ejemplo.test' });
    await mail.changed({ email: 'ana@ejemplo.test', enrolled: false });
    expect(sent[0]?.text).toContain('https://backoffice.example.test/contrasena-olvidada');
    expect(sent[1]?.text).toContain('aún no tiene aplicación de autenticación');
  });
});
