import { describe, expect, it } from 'vitest';

import type { MailMessage } from '../mail/mailer.js';

import {
  createInvitationSender,
  hashInvitationToken,
  invitationLink,
  makeInvitationToken,
  plainName,
} from './invitations.js';

describe('invitation tokens', () => {
  it('are 256 random bits, base64url, stored only as their SHA-256 in hex', () => {
    const token = makeInvitationToken();
    expect(token).toMatch(/^[\w-]{43}$/u);
    expect(makeInvitationToken()).not.toBe(token);
    expect(hashInvitationToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('travel in the fragment, which no server sees', () => {
    expect(invitationLink('https://backoffice.example.test', 'a/b')).toBe(
      'https://backoffice.example.test/invitacion#token=a%2Fb',
    );
  });
});

describe('the invitation email', () => {
  it('names the inviter as plain text, the roles in Spanish, and the link', async () => {
    const sent: MailMessage[] = [];
    const send = createInvitationSender({
      mailer: { send: async (message) => void sent.push(message) },
      staffOrigin: 'https://backoffice.example.test',
      productName: 'Backoffice de ejemplo',
    });
    await send({
      email: 'nueva@ejemplo.test',
      roles: ['onboarding', 'outreach'],
      inviter: 'Luis‮ www.malo.example',
      token: 't',
    });
    expect(sent[0]?.text).toContain('Luis te ha invitado');
    expect(sent[0]?.text).toContain('Onboarding, Relaciones externas');
    expect(sent[0]?.text).toContain('https://backoffice.example.test/invitacion#token=t');
    expect(sent[0]?.text).not.toContain('malo.example');
  });

  it('keeps names to one short line', () => {
    expect(plainName(`Ana\n\nCompra ya https://x.example ${'a'.repeat(200)}`)).toHaveLength(80);
  });
});
